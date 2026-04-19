import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  ALERT_COOLDOWN_MINUTES,
  SUPPRESSED_ALERT_ERROR_PREFIX,
  USER_ALERT_BURST_LIMIT,
  USER_ALERT_BURST_WINDOW_MINUTES,
} from '@/lib/scanner/services/alert-throttle-service'
import { checkConnectorHealth } from '@/lib/scanner/services/connector-health-service'

export const dynamic = 'force-dynamic'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function parseDays(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.round(parsed), 30)
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const days = parseDays(req.nextUrl.searchParams.get('days'), 7)
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const alertsFrom = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [connectorHealth, recentRuns, recentSourceRuns, sentAlerts, failedAlerts, suppressedAlerts, lastSentAlert] = await Promise.all([
      checkConnectorHealth(),
      prisma.scanRun.findMany({
        where: {
          userId: user.id,
          startedAt: {
            gte: dateFrom,
          },
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
      prisma.scanSourceRun.findMany({
        where: {
          scanRun: {
            userId: user.id,
            startedAt: {
              gte: dateFrom,
            },
          },
        },
        select: {
          source: true,
          status: true,
          found: true,
          finishedAt: true,
          startedAt: true,
        },
      }),
      prisma.alert.count({
        where: {
          userId: user.id,
          sent: true,
          createdAt: {
            gte: alertsFrom,
          },
        },
      }),
      prisma.alert.count({
        where: {
          userId: user.id,
          sent: false,
          createdAt: {
            gte: alertsFrom,
          },
          NOT: {
            errorMsg: {
              contains: SUPPRESSED_ALERT_ERROR_PREFIX,
            },
          },
        },
      }),
      prisma.alert.count({
        where: {
          userId: user.id,
          sent: false,
          createdAt: {
            gte: alertsFrom,
          },
          errorMsg: {
            contains: SUPPRESSED_ALERT_ERROR_PREFIX,
          },
        },
      }),
      prisma.alert.findFirst({
        where: {
          userId: user.id,
          sent: true,
        },
        orderBy: [{ sentAt: 'desc' }],
        select: {
          sentAt: true,
        },
      }),
    ])

    const connectorRuns = new Map<
      string,
      {
        totalRuns: number
        completed: number
        partial: number
        failed: number
        avgFound: number
        lastFinishedAt: Date | null
      }
    >()

    for (const sourceRun of recentSourceRuns) {
      const current = connectorRuns.get(sourceRun.source) || {
        totalRuns: 0,
        completed: 0,
        partial: 0,
        failed: 0,
        avgFound: 0,
        lastFinishedAt: null,
      }

      current.totalRuns += 1
      current.avgFound += sourceRun.found
      if (sourceRun.status === 'COMPLETED') current.completed += 1
      if (sourceRun.status === 'PARTIAL') current.partial += 1
      if (sourceRun.status === 'FAILED') current.failed += 1

      const lastTimestamp = sourceRun.finishedAt || sourceRun.startedAt
      if (!current.lastFinishedAt || lastTimestamp.getTime() > current.lastFinishedAt.getTime()) {
        current.lastFinishedAt = lastTimestamp
      }

      connectorRuns.set(sourceRun.source, current)
    }

    const connectors = connectorHealth.connectors.map((connector) => {
      const runStats = connectorRuns.get(connector.source)

      return {
        ...connector,
        recentRuns: {
          totalRuns: runStats?.totalRuns || 0,
          completed: runStats?.completed || 0,
          partial: runStats?.partial || 0,
          failed: runStats?.failed || 0,
          avgFound:
            runStats && runStats.totalRuns > 0 ? Number((runStats.avgFound / runStats.totalRuns).toFixed(1)) : 0,
          lastFinishedAt: runStats?.lastFinishedAt || null,
        },
      }
    })

    const completedRuns = recentRuns.filter((run) => run.status === 'COMPLETED').length
    const partialRuns = recentRuns.filter((run) => run.status === 'PARTIAL').length
    const failedRuns = recentRuns.filter((run) => run.status === 'FAILED').length
    const runningRuns = recentRuns.filter((run) => run.status === 'RUNNING').length

    const avgRunDurationSeconds =
      recentRuns.length > 0
        ? Math.round(
            recentRuns.reduce((total, run) => {
              const end = run.finishedAt || run.startedAt
              return total + Math.max(0, Math.round((end.getTime() - run.startedAt.getTime()) / 1000))
            }, 0) / recentRuns.length
          )
        : 0

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      scanner: {
        days,
        totalRuns: recentRuns.length,
        completedRuns,
        partialRuns,
        failedRuns,
        runningRuns,
        avgRunDurationSeconds,
        lastRunAt:
          recentRuns.sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0]?.startedAt || null,
      },
      connectors: {
        ...connectorHealth.summary,
        connectors,
      },
      alerts: {
        sentLast24h: sentAlerts,
        failedLast24h: failedAlerts,
        suppressedLast24h: suppressedAlerts,
        lastSentAt: lastSentAlert?.sentAt || null,
        policy: {
          cooldownMinutes: ALERT_COOLDOWN_MINUTES,
          burstLimit: USER_ALERT_BURST_LIMIT,
          burstWindowMinutes: USER_ALERT_BURST_WINDOW_MINUTES,
        },
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao carregar health do scanner:', error)
    return NextResponse.json({ error: 'Erro ao carregar health do scanner' }, { status: 500 })
  }
}
