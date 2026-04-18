import { buildAlertMessage } from '@/lib/analyzer'
import { analysisRiskMap, parseEstimatedMarginValue, runAnalysisWithFallback } from '@/lib/listing-analysis'
import { extractListingFromUrl } from '@/lib/listing-extractor'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import type { ScanResult } from '@/lib/scan-sources'
import { sendTelegramAlert } from '@/lib/telegram'

type ProcessedItem = {
  url: string
  title?: string
  status: 'created' | 'updated' | 'skipped'
  detail: string
  listingId?: string
}

type ProcessResult = {
  item: ProcessedItem
  alerted: boolean
}

type ListingSeed = {
  title: string
  description?: string
  price?: number
  type: 'MOTO' | 'CARRO'
  source: string
  sourceUrl: string
  imageUrls: string[]
  brand?: string
  model?: string
  year?: number
  mileage?: number
  city?: string
  state?: string
  sourceContext?: string
}

function inferVehicleTypeFromText(value?: string | null): 'MOTO' | 'CARRO' {
  const normalized = (value || '').toLowerCase()
  const motoTokens = ['moto', 'xre', 'cg', 'biz', 'fazer', 'bros', 'hornet', 'pcx', 'nmax', 'cb ', 'titan']
  return motoTokens.some((token) => normalized.includes(token)) ? 'MOTO' : 'CARRO'
}

async function maybeSendAlert(
  listingId: string,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>
) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })
  if (listing.deletedAt) {
    return {
      passedRadar: false,
      alerted: false,
      listing,
    }
  }

  const passedRadar = matchesRadar(listing, normalizedConfig)
  let alerted = false

  if (passedRadar && !listing.alertSent) {
    const userConfig = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramEnabled: true, telegramChatId: true },
    })

    if (userConfig?.telegramEnabled && userConfig.telegramChatId) {
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

      const sent = await sendTelegramAlert(message, userConfig.telegramChatId)

      await prisma.alert.create({
        data: {
          userId,
          listingId: listing.id,
          channel: 'telegram',
          message,
          sent,
          sentAt: sent ? new Date() : undefined,
          errorMsg: sent ? undefined : 'Falha no envio do alerta.',
        },
      })

      if (sent) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { alertSent: true, status: 'ALERTED' },
        })
        alerted = true
      }
    }
  }

  return {
    passedRadar,
    alerted,
    listing,
  }
}

async function processListingSeed(
  seed: ListingSeed,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>
): Promise<ProcessResult> {
  const title = seed.title || 'Anuncio monitorado'

  if (!seed.price) {
    return {
      item: { url: seed.sourceUrl, title, status: 'skipped', detail: 'Preco nao identificado.' },
      alerted: false,
    }
  }

  const existing = await prisma.listing.findFirst({
    where: { userId, sourceUrl: seed.sourceUrl, deletedAt: null },
  })

  const trashed = existing
    ? null
    : await prisma.listing.findFirst({
        where: {
          userId,
          sourceUrl: seed.sourceUrl,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          title: true,
        },
      })

  if (trashed) {
    return {
      item: {
        url: seed.sourceUrl,
        title: trashed.title || title,
        status: 'skipped',
        detail: 'Anuncio ja esta na lixeira.',
        listingId: trashed.id,
      },
      alerted: false,
    }
  }

  const baseData = {
    title,
    description: seed.description,
    price: seed.price,
    type: seed.type,
    source: seed.source,
    sourceUrl: seed.sourceUrl,
    imageUrls: seed.imageUrls,
    brand: seed.brand,
    model: seed.model,
    year: seed.year,
    mileage: seed.mileage,
    city: seed.city,
    state: seed.state,
    status: 'PENDING' as const,
  }

  const listing = existing
    ? await prisma.listing.update({ where: { id: existing.id }, data: baseData })
    : await prisma.listing.create({ data: { userId, ...baseData } })

  const { analysis } = await runAnalysisWithFallback({
    type: seed.type,
    title,
    description: seed.description,
    price: seed.price,
    mileage: seed.mileage || undefined,
    year: seed.year || undefined,
    city: seed.city || undefined,
    sourceUrl: seed.sourceUrl,
    sourceContext: seed.sourceContext,
    brand: seed.brand || undefined,
    model: seed.model || undefined,
  })

  const riskLevel = analysisRiskMap[analysis.nivel_risco] || 'MEDIUM'
  const estimatedMargin = parseEstimatedMarginValue(analysis.margem_estimada)

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      title: analysis.titulo || listing.title,
      opportunityScore: analysis.score_oportunidade,
      riskScore: analysis.score_risco,
      riskLevel,
      aiSummary: analysis.resumo,
      positiveSignals: analysis.sinais_positivos || [],
      alertSignals: analysis.sinais_alerta || [],
      fipePrice: analysis.fipe_estimada,
      avgMarketPrice: analysis.media_mercado,
      estimatedMargin,
      status: 'ANALYZED',
    },
  })

  const { passedRadar, alerted } = await maybeSendAlert(updated.id, userId, normalizedConfig)

  return {
    item: {
      url: seed.sourceUrl,
      title: updated.title,
      status: existing ? 'updated' : 'created',
      detail: `Score ${updated.opportunityScore || 0} | risco ${updated.riskLevel || 'MEDIUM'}${passedRadar ? ' | passou no radar' : ''}`,
      listingId: updated.id,
    },
    alerted,
  }
}

export async function processUrl(
  sourceUrl: string,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>
): Promise<ProcessResult> {
  const extracted = await extractListingFromUrl(sourceUrl)

  return processListingSeed(
    {
      title: extracted.title || 'Anuncio monitorado',
      description: extracted.description,
      price: extracted.price,
      type: extracted.detectedVehicleType || 'CARRO',
      source: extracted.source,
      sourceUrl: extracted.resolvedUrl,
      imageUrls: extracted.imageUrls,
      brand: extracted.brand,
      model: extracted.model,
      year: extracted.year,
      mileage: extracted.mileage,
      city: extracted.city,
      state: extracted.state,
      sourceContext: extracted.sourceContext,
    },
    userId,
    normalizedConfig
  )
}

export async function processDirectResult(
  result: ScanResult,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>,
  fallbackType: 'MOTO' | 'CARRO' = 'CARRO'
): Promise<ProcessResult> {
  return processListingSeed(
    {
      title: result.title || 'Anuncio monitorado',
      description: undefined,
      price: result.price,
      type: result.source === 'mercadolivre' ? inferVehicleTypeFromText(result.title) : fallbackType,
      source: result.source,
      sourceUrl: result.url,
      imageUrls: result.imageUrl ? [result.imageUrl] : [],
      brand: result.brand,
      model: result.model,
      year: result.year,
      mileage: result.mileage,
      city: result.city,
      state: result.state,
      sourceContext: [result.title, result.city, result.state].filter(Boolean).join(' | '),
    },
    userId,
    normalizedConfig
  )
}
