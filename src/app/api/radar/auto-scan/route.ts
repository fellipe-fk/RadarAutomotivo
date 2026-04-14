import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { normalizeRadarConfig } from '@/lib/radar'
import { processUrl } from '@/lib/radar-auto-scan'

function isCronAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const cronSecret = process.env.CRON_SECRET?.trim()

  return Boolean(token && cronSecret && token === cronSecret)
}

async function getLastListingDate(userId: string) {
  const lastListing = await prisma.listing.findFirst({
    where: { userId },
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
      const userResults: Array<{ url: string; title?: string; status: string; detail: string }> = []

      for (const sourceUrl of manualUrls) {
        try {
          const result = await processUrl(sourceUrl, user.id, normalizedConfig)
          summary.listingsProcessed += result.item.status === 'skipped' ? 0 : 1
          if (result.alerted) summary.alertsTriggered += 1
          userResults.push(result.item)
        } catch (error) {
          userResults.push({
            url: sourceUrl,
            status: 'skipped',
            detail: error instanceof Error ? error.message : 'Falha ao processar URL',
          })
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
