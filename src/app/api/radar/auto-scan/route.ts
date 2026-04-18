import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { normalizeRadarConfig } from '@/lib/radar'
import { processDirectResult, processUrl } from '@/lib/radar-auto-scan'
import { searchFreeSources } from '@/lib/scan-sources'

export const dynamic = 'force-dynamic'

function isCronAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const cronSecret = process.env.CRON_SECRET?.trim()

  return Boolean(token && cronSecret && token === cronSecret)
}

async function getLastListingDate(userId: string) {
  const lastListing = await prisma.listing.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  return lastListing?.createdAt || null
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

      const normalizedConfig = normalizeRadarConfig(config)
      const scanType = normalizedConfig.tipo === 'MOTO' || normalizedConfig.tipo === 'CARRO' ? normalizedConfig.tipo : 'TODOS'
      const lastListingAt = await getLastListingDate(user.id)
      const frequenciaMs = (config.frequenciaMin || 60) * 60 * 1000
      const elapsed = lastListingAt ? Date.now() - lastListingAt.getTime() : Infinity

      if (elapsed < frequenciaMs) {
        summary.usersSkipped += 1
        results.push({ userId: user.id, processed: false, reason: 'Fora da janela de frequencia' })
        continue
      }

      summary.usersProcessed += 1

      const manualUrls = Array.from(new Set((config.seedUrls || []).map((u) => u.trim()).filter(Boolean))).slice(0, 20)
      const directResultsMap = new Map<string, Awaited<ReturnType<typeof searchFreeSources>>['directResults'][number]>()
      const discoveredUrls: string[] = []

      if (normalizedConfig.modelos.length > 0 && normalizedConfig.fontes.length > 0) {
        for (const modelo of normalizedConfig.modelos.slice(0, 3)) {
          const { directResults, linkUrls } = await searchFreeSources(modelo, scanType, normalizedConfig.fontes)

          for (const result of directResults) {
            directResultsMap.set(result.url, result)
          }

          discoveredUrls.push(...linkUrls)
        }
      }

      for (const result of Array.from(directResultsMap.values()).slice(0, 30)) {
        try {
          const processed = await processDirectResult(result, user.id, normalizedConfig, scanType === 'TODOS' ? 'CARRO' : scanType)
          summary.listingsProcessed += processed.item.status === 'skipped' ? 0 : 1
          if (processed.alerted) summary.alertsTriggered += 1
        } catch {
          continue
        }
      }

      for (const sourceUrl of Array.from(new Set([...manualUrls, ...discoveredUrls])).slice(0, 30)) {
        try {
          const processed = await processUrl(sourceUrl, user.id, normalizedConfig)
          summary.listingsProcessed += processed.item.status === 'skipped' ? 0 : 1
          if (processed.alerted) summary.alertsTriggered += 1
        } catch {
          continue
        }
      }

      results.push({ userId: user.id, processed: true })
    }

    return NextResponse.json({ summary, results })
  } catch (error) {
    console.error('Erro ao executar auto-scan:', error)
    return NextResponse.json({ error: 'Erro ao executar auto-scan' }, { status: 500 })
  }
}
