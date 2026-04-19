import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function parseLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.round(parsed), max)
}

function parseDays(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.round(parsed), 30)
}

function formatTrendDay(value: Date) {
  return value.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const limit = parseLimit(req.nextUrl.searchParams.get('limit'), 10, 50)
    const days = parseDays(req.nextUrl.searchParams.get('days'), 7)
    const status = req.nextUrl.searchParams.get('status')?.trim().toUpperCase() || undefined
    const source = req.nextUrl.searchParams.get('source')?.trim().toLowerCase() || undefined
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const runs = await prisma.scanRun.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: dateFrom },
        ...(status ? { status } : {}),
        ...(source
          ? {
              sourceRuns: {
                some: {
                  source,
                },
              },
            }
          : {}),
      },
      include: {
        sourceRuns: {
          where: source ? { source } : undefined,
          orderBy: [{ source: 'asc' }],
        },
      },
      orderBy: [{ startedAt: 'desc' }],
      take: limit,
    })

    const sourceRuns = runs.flatMap((run) => run.sourceRuns)
    const sourceNames = Array.from(new Set(sourceRuns.map((entry) => entry.source))).sort()

    const sourceHealth = sourceNames.map((source) => {
      const items = sourceRuns.filter((entry) => entry.source === source)
      const completed = items.filter((entry) => entry.status === 'COMPLETED').length
      const partial = items.filter((entry) => entry.status === 'PARTIAL').length
      const failed = items.filter((entry) => entry.status === 'FAILED').length
      const totalFound = items.reduce((sum, entry) => sum + entry.found, 0)
      const totalImported = items.reduce((sum, entry) => sum + entry.imported, 0)
      const totalUpdated = items.reduce((sum, entry) => sum + entry.updated, 0)
      const totalFailed = items.reduce((sum, entry) => sum + entry.failed, 0)
      const lastFinishedAt =
        items
          .map((entry) => entry.finishedAt || entry.startedAt)
          .sort((left, right) => right.getTime() - left.getTime())[0] || null

      return {
        source,
        totalRuns: items.length,
        completed,
        partial,
        failed,
        successRate: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
        avgFound: items.length > 0 ? Number((totalFound / items.length).toFixed(1)) : 0,
        avgImported: items.length > 0 ? Number((totalImported / items.length).toFixed(1)) : 0,
        qualificationRate: totalFound > 0 ? Math.round(((totalImported + totalUpdated) / totalFound) * 100) : 0,
        failRate: totalFound > 0 ? Math.round((totalFailed / totalFound) * 100) : 0,
        lastFinishedAt,
      }
    })

    const trendAccumulator = new Map<
      string,
      {
        source: string
        day: string
        totalRuns: number
        found: number
        imported: number
        updated: number
        failed: number
        completed: number
        partial: number
        failedRuns: number
      }
    >()

    for (const sourceRun of sourceRuns) {
      const day = formatTrendDay(sourceRun.startedAt)
      const key = `${sourceRun.source}:${day}`
      const current = trendAccumulator.get(key) || {
        source: sourceRun.source,
        day,
        totalRuns: 0,
        found: 0,
        imported: 0,
        updated: 0,
        failed: 0,
        completed: 0,
        partial: 0,
        failedRuns: 0,
      }

      current.totalRuns += 1
      current.found += sourceRun.found
      current.imported += sourceRun.imported
      current.updated += sourceRun.updated
      current.failed += sourceRun.failed
      current.completed += sourceRun.status === 'COMPLETED' ? 1 : 0
      current.partial += sourceRun.status === 'PARTIAL' ? 1 : 0
      current.failedRuns += sourceRun.status === 'FAILED' ? 1 : 0

      trendAccumulator.set(key, current)
    }

    const sourceTrends = Array.from(trendAccumulator.values())
      .map((entry) => ({
        ...entry,
        qualificationRate: entry.found > 0 ? Math.round(((entry.imported + entry.updated) / entry.found) * 100) : 0,
        failRate: entry.found > 0 ? Math.round((entry.failed / entry.found) * 100) : 0,
      }))
      .sort((left, right) => {
        if (left.source === right.source) {
          return right.day.localeCompare(left.day)
        }

        return left.source.localeCompare(right.source)
      })

    const totals = {
      totalRuns: runs.length,
      completed: runs.filter((run) => run.status === 'COMPLETED').length,
      partial: runs.filter((run) => run.status === 'PARTIAL').length,
      failed: runs.filter((run) => run.status === 'FAILED').length,
      avgFound:
        runs.length > 0 ? Number((runs.reduce((sum, run) => sum + run.totalFound, 0) / runs.length).toFixed(1)) : 0,
      avgNew:
        runs.length > 0 ? Number((runs.reduce((sum, run) => sum + run.totalNew, 0) / runs.length).toFixed(1)) : 0,
      avgUpdated:
        runs.length > 0 ? Number((runs.reduce((sum, run) => sum + run.totalUpdated, 0) / runs.length).toFixed(1)) : 0,
    }

    return NextResponse.json({
      runs,
      health: {
        totals,
        lastRunAt: runs[0]?.startedAt || null,
        sourceHealth,
      },
      sourceTrends,
      filters: {
        limit,
        days,
        status: status || null,
        source: source || null,
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao carregar runs do radar:', error)
    return NextResponse.json({ error: 'Erro ao carregar historico do scanner' }, { status: 500 })
  }
}
