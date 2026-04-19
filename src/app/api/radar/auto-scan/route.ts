import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { executeRadarScan } from '@/lib/scanner/services/scan-orchestrator'
import { ensureNextScanAt, isRadarScanDue } from '@/lib/scanner/services/schedule-service'

export const dynamic = 'force-dynamic'

function isCronAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const cronSecret = process.env.CRON_SECRET?.trim()

  return Boolean(token && cronSecret && token === cronSecret)
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: {
        radarConfig: {
          is: {
            ativo: true,
            autoScanEnabled: true,
          },
        },
      },
      select: {
        id: true,
      },
    })

    const summary = {
      usersTotal: users.length,
      usersProcessed: 0,
      usersSkipped: 0,
      listingsProcessed: 0,
      alertsTriggered: 0,
    }

    const results: Array<{
      userId: string
      processed: boolean
      reason?: string
    }> = []

    for (const user of users) {
      const config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })
      if (!config) {
        summary.usersSkipped += 1
        results.push({ userId: user.id, processed: false, reason: 'Sem configuracao de radar' })
        continue
      }

      const nextScanAt = ensureNextScanAt(config)
      if (!isRadarScanDue(config)) {
        summary.usersSkipped += 1
        results.push({
          userId: user.id,
          processed: false,
          reason: nextScanAt ? `Proximo scan em ${nextScanAt.toISOString()}` : 'Auto scan desabilitado',
        })
        continue
      }

      summary.usersProcessed += 1

      const result = await executeRadarScan({
        userId: user.id,
        radarConfigId: config.id,
        config,
        mode: 'auto',
        includeSearchPageFallback: false,
      })

      summary.listingsProcessed += result.summary.analyzed
      summary.alertsTriggered += result.summary.alerted

      results.push({ userId: user.id, processed: true })
    }

    return NextResponse.json({ summary, results })
  } catch (error) {
    console.error('Erro ao executar auto-scan:', error)
    return NextResponse.json({ error: 'Erro ao executar auto-scan' }, { status: 500 })
  }
}
