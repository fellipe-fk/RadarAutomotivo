import { NextRequest, NextResponse } from 'next/server'

import { buildAlertMessage } from '@/lib/analyzer'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import { buildScheduleOnConfigSave } from '@/lib/scanner/services/schedule-service'
import { sendTelegramAlert, testTelegramConnection } from '@/lib/telegram'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function normalizeDecisionStatus(value: unknown) {
  if (value === 'APPROVED' || value === 'REJECTED') return value
  return null
}

function normalizeOptionalNote(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

async function deliverForcedAlert(userId: string, listingId: string, chatId?: string) {
  const [user, listing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegramChatId: true,
      },
    }),
    prisma.listing.findFirst({
      where: {
        id: listingId,
        userId,
        deletedAt: null,
      },
    }),
  ])

  if (!listing) {
    return {
      ok: false,
      status: 404 as const,
      payload: { error: 'Listing nao encontrada' },
    }
  }

  const targetChatId = chatId || user?.telegramChatId || undefined
  if (!targetChatId) {
    return {
      ok: false,
      status: 400 as const,
      payload: { error: 'Telegram Chat ID nao configurado para este usuario' },
    }
  }

  const message = buildAlertMessage({
    title: listing.title,
    price: listing.price,
    city: listing.city || undefined,
    distanceKm: listing.distanceKm || undefined,
    opportunityScore: listing.opportunityScore || undefined,
    riskLevel: listing.riskLevel || undefined,
    estimatedMargin: listing.estimatedMargin || undefined,
    aiSummary: listing.aiSummary || undefined,
    sourceUrl: listing.sourceUrl || undefined,
  })

  const sent = await sendTelegramAlert(message, targetChatId)

  await prisma.alert.create({
    data: {
      userId,
      listingId: listing.id,
      channel: 'telegram',
      message,
      sent,
      sentAt: sent ? new Date() : undefined,
      errorMsg: sent ? undefined : 'Falha no envio forcado do alerta.',
    },
  })

  if (sent) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        alertSent: true,
        status: 'ALERTED',
      },
    })
  }

  return {
    ok: true,
    status: 200 as const,
    payload: { ok: sent, sent },
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    let config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })

    if (!config) {
      config = await prisma.radarConfig.create({
        data: {
          userId: user.id,
          autoScanEnabled: true,
          nextScanAt: new Date(),
        },
      })
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
          deletedAt: null,
        },
        include: {
          reviewDecision: {
            select: {
              status: true,
              note: true,
              decidedAt: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.listing.findMany({
        where: {
          userId: user.id,
          isDiscarded: false,
          deletedAt: null,
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
    const suppressedAlerts = failedAlerts.filter((alert) => (alert.errorMsg || '').toLowerCase().includes('suprimido:'))
    const reviewQueue = readyListings
      .filter((listing) => !listing.alertSent)
      .map((listing) => {
        const latestAlert = alerts.find((alert) => alert.listingId === listing.id)

        return {
          id: listing.id,
          title: listing.title,
          price: listing.price,
          city: listing.city,
          sourceUrl: listing.sourceUrl,
          opportunityScore: listing.opportunityScore,
          estimatedMargin: listing.estimatedMargin,
          riskLevel: listing.riskLevel,
          aiSummary: listing.aiSummary,
          positiveSignals: listing.positiveSignals,
          alertSignals: listing.alertSignals,
          reviewDecision: listing.reviewDecision
            ? {
                status: listing.reviewDecision.status,
                note: listing.reviewDecision.note,
                decidedAt: listing.reviewDecision.decidedAt,
              }
            : null,
          latestAlert: latestAlert
            ? {
                id: latestAlert.id,
                createdAt: latestAlert.createdAt,
                sent: latestAlert.sent,
                errorMsg: latestAlert.errorMsg,
              }
            : null,
        }
      })
      .sort((left, right) => {
        const leftPending = left.reviewDecision ? 1 : 0
        const rightPending = right.reviewDecision ? 1 : 0

        if (leftPending !== rightPending) {
          return leftPending - rightPending
        }

        return (right.opportunityScore || 0) - (left.opportunityScore || 0)
      })
    const latestScanRun = await prisma.scanRun.findFirst({
      where: {
        userId: user.id,
        radarConfigId: config.id,
      },
      orderBy: [{ startedAt: 'desc' }],
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        totalFound: true,
        totalNew: true,
        totalUpdated: true,
        totalFailed: true,
      },
    })
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
        suppressedCount: suppressedAlerts.length,
        lastTriggeredAt: alerts[0]?.createdAt || null,
        lastScanRun: latestScanRun,
      },
      history: alerts,
      preview: readyListings[0] || null,
      radarPreview,
      reviewQueue,
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
    const scheduleInput = {
      ativo: body.ativo ?? config?.ativo,
      autoScanEnabled: body.autoScanEnabled ?? body.ativo ?? config?.autoScanEnabled,
      frequenciaMin: body.frequenciaMin ?? config?.frequenciaMin,
      lastScanAt: config?.lastScanAt,
      nextScanAt: config?.nextScanAt,
    }
    const scheduleData = buildScheduleOnConfigSave(scheduleInput)

    if (config) {
      config = await prisma.radarConfig.update({
        where: { id: config.id },
        data: {
          ...body,
          ...scheduleData,
          scoreAlerta: body.minOpportunity ?? body.scoreAlerta ?? undefined,
          riscoMax: body.maxRisk ?? body.riscoMax ?? undefined,
        },
      })
    } else {
      config = await prisma.radarConfig.create({
        data: {
          ...body,
          userId: user.id,
          ...scheduleData,
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

    if (action === 'force-alert') {
      const listingId = typeof body.listingId === 'string' ? body.listingId : ''

      if (!listingId) {
        return NextResponse.json({ error: 'ListingId obrigatorio' }, { status: 400 })
      }

      const delivery = await deliverForcedAlert(user.id, listingId, chatId || user.telegramChatId || undefined)

      if (!delivery.ok) {
        return NextResponse.json(delivery.payload, { status: delivery.status })
      }

      await prisma.listingReviewDecision.upsert({
        where: {
          listingId,
        },
        update: {
          status: 'APPROVED',
          note: 'Aprovado e enviado manualmente pela central de alertas.',
          decidedAt: new Date(),
        },
        create: {
          userId: user.id,
          listingId,
          status: 'APPROVED',
          note: 'Aprovado e enviado manualmente pela central de alertas.',
        },
      })

      return NextResponse.json(delivery.payload)
    }

    if (action === 'review-decision') {
      const listingId = typeof body.listingId === 'string' ? body.listingId : ''
      const reviewStatus = normalizeDecisionStatus(body.status)
      const note = normalizeOptionalNote(body.note)
      const sendNow = body.sendNow === true

      if (!listingId || !reviewStatus) {
        return NextResponse.json({ error: 'ListingId e status sao obrigatorios' }, { status: 400 })
      }

      const listing = await prisma.listing.findFirst({
        where: {
          id: listingId,
          userId: user.id,
          deletedAt: null,
        },
      })

      if (!listing) {
        return NextResponse.json({ error: 'Listing nao encontrada' }, { status: 404 })
      }

      const decision = await prisma.listingReviewDecision.upsert({
        where: {
          listingId: listing.id,
        },
        update: {
          status: reviewStatus,
          note: note || null,
          decidedAt: new Date(),
        },
        create: {
          userId: user.id,
          listingId: listing.id,
          status: reviewStatus,
          note: note || null,
        },
      })

      if (reviewStatus === 'APPROVED' && sendNow) {
        const delivery = await deliverForcedAlert(user.id, listing.id, chatId || user.telegramChatId || undefined)

        if (!delivery.ok) {
          return NextResponse.json(delivery.payload, { status: delivery.status })
        }

        return NextResponse.json({
          ok: true,
          decision,
          sent: delivery.payload.sent,
        })
      }

      return NextResponse.json({
        ok: true,
        decision,
        sent: false,
      })
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
