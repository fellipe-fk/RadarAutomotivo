import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import { testTelegramConnection } from '@/lib/telegram'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    let config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })

    if (!config) {
      config = await prisma.radarConfig.create({ data: { userId: user.id } })
    }

    const [alerts, listings, radarLogs] = await Promise.all([
      prisma.alert.findMany({
        where: { userId: user.id },
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              price: true,
              city: true,
              sourceUrl: true,
              opportunityScore: true,
              estimatedMargin: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 20,
      }),
      prisma.listing.findMany({
        where: {
          userId: user.id,
          status: 'ANALYZED',
          isDiscarded: false,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.listing.findMany({
        where: {
          userId: user.id,
          isDiscarded: false,
        },
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          status: true,
          opportunityScore: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 50,
      }),
    ])

    const normalizedConfig = normalizeRadarConfig(config)
    const readyListings = listings.filter((listing) => matchesRadar(listing, normalizedConfig))
    const sentAlerts = alerts.filter((alert) => alert.sent)
    const failedAlerts = alerts.filter((alert) => !alert.sent)
    const radarPreview = radarLogs.slice(0, 8).map((listing) => {
      const passed = matchesRadar(
        {
          id: listing.id,
          title: listing.title,
          sourceUrl: listing.sourceUrl,
          type: 'CARRO',
          price: 0,
          source: 'manual',
          createdAt: listing.createdAt,
          updatedAt: listing.createdAt,
          userId: user.id,
          status: listing.status,
          isDiscarded: false,
          isFavorite: false,
          alertSent: false,
        },
        normalizedConfig
      )

      return {
        id: listing.id,
        title: listing.title,
        sourceUrl: listing.sourceUrl,
        opportunityScore: listing.opportunityScore,
        status: listing.status,
        className: passed ? 'scan-log__line scan-log__line--ok' : 'scan-log__line scan-log__line--skip',
        text: passed
          ? `${listing.title} | score ${listing.opportunityScore ?? 0} | encontrado no radar`
          : `${listing.title} | nao atende aos filtros atuais`,
      }
    })

    return NextResponse.json({
      config: normalizedConfig,
      stats: {
        readyCount: readyListings.length,
        totalAlerts: alerts.length,
        sentCount: sentAlerts.length,
        failedCount: failedAlerts.length,
        lastTriggeredAt: alerts[0]?.createdAt || null,
      },
      history: alerts,
      preview: readyListings[0] || null,
      radarPreview,
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao buscar configuracao de alertas:', error)
    return NextResponse.json({ error: 'Erro ao buscar configuracao' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    let config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })

    if (config) {
      config = await prisma.radarConfig.update({
        where: { id: config.id },
        data: {
          ...body,
          scoreAlerta: body.minOpportunity ?? body.scoreAlerta ?? undefined,
          riscoMax: body.maxRisk ?? body.riscoMax ?? undefined,
        },
      })
    } else {
      config = await prisma.radarConfig.create({
        data: {
          ...body,
          userId: user.id,
          scoreAlerta: body.minOpportunity ?? body.scoreAlerta ?? undefined,
          riscoMax: body.maxRisk ?? body.riscoMax ?? undefined,
        },
      })
    }

    return NextResponse.json({ config })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao salvar configuracao de alertas:', error)
    return NextResponse.json({ error: 'Erro ao salvar configuracao' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const { action, chatId } = body

    if (action === 'test-telegram') {
      const result = await testTelegramConnection(chatId || user.telegramChatId || undefined)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Acao nao reconhecida' }, { status: 400 })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao executar acao de alertas:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
