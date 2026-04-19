import { buildAlertMessage } from '@/lib/analyzer'
import { analysisRiskMap, parseEstimatedMarginValue, runAnalysisWithFallback } from '@/lib/listing-analysis'
import { extractListingFromUrl } from '@/lib/listing-extractor'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import type { ScanResult } from '@/lib/scan-sources'
import type { ListingSeed as ScannerListingSeed } from '@/lib/scanner/contracts/listing-seed'
import { normalizeListingSeed } from '@/lib/scanner/pipelines/normalize'
import {
  canDispatchListingAlert,
  SUPPRESSED_ALERT_ERROR_PREFIX,
} from '@/lib/scanner/services/alert-throttle-service'
import { createListingSnapshot } from '@/lib/scanner/services/listing-snapshot-service'
import { evaluateAlertEligibility } from '@/lib/scanner/services/alert-policy-service'
import { evaluateOpportunity } from '@/lib/scanner/services/opportunity-service'
import { deriveRiskLevelFromScore, evaluateRisk } from '@/lib/scanner/services/risk-service'
import { upsertNormalizedListing } from '@/lib/scanner/services/listing-upsert'
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

type AlertEvaluationResult = {
  passedRadar: boolean
  policyAllowed: boolean
  throttleAllowed: boolean
  alerted: boolean
  reason?: string | null
}

type ProcessOptions = {
  scanRunId?: string
}

type RadarListingSeed = {
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

async function recordSuppressedAlert(userId: string, listingId: string, title: string, reason: string) {
  const recentSuppressed = await prisma.alert.findFirst({
    where: {
      userId,
      listingId,
      sent: false,
      errorMsg: `${SUPPRESSED_ALERT_ERROR_PREFIX} ${reason}`,
      createdAt: {
        gte: new Date(Date.now() - 60 * 60 * 1000),
      },
    },
    select: { id: true },
  })

  if (recentSuppressed) {
    return
  }

  await prisma.alert.create({
    data: {
      userId,
      listingId,
      channel: 'telegram',
      message: `Alerta suprimido para ${title}`,
      sent: false,
      errorMsg: `${SUPPRESSED_ALERT_ERROR_PREFIX} ${reason}`,
    },
  })
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
      evaluation: {
        passedRadar: false,
        policyAllowed: false,
        throttleAllowed: false,
        alerted: false,
        reason: 'Listing removida da operacao ativa',
      } as AlertEvaluationResult,
    }
  }

  const passedRadar = matchesRadar(listing, normalizedConfig)
  let alerted = false

  if (passedRadar && !listing.alertSent) {
    const policy = evaluateAlertEligibility(
      {
        opportunityScore: listing.opportunityScore,
        riskScore: listing.riskScore,
        riskLevel: listing.riskLevel,
        estimatedMargin: listing.estimatedMargin,
        price: listing.price,
        avgMarketPrice: listing.avgMarketPrice,
        positiveSignals: listing.positiveSignals || [],
        alertSignals: listing.alertSignals || [],
        aiSummary: listing.aiSummary,
      },
      normalizedConfig
    )

    if (!policy.allowed) {
      const reason = policy.reasons[0] || 'Politica de alerta bloqueou o envio'
      await recordSuppressedAlert(userId, listing.id, listing.title, reason)

      return {
        passedRadar,
        alerted: false,
        listing,
        evaluation: {
          passedRadar,
          policyAllowed: false,
          throttleAllowed: true,
          alerted: false,
          reason,
        } as AlertEvaluationResult,
      }
    }

    const throttle = await canDispatchListingAlert(userId, listing.id)

    if (!throttle.allowed) {
      const reason = throttle.reason || 'Throttle aplicado'
      await recordSuppressedAlert(userId, listing.id, listing.title, reason)

      return {
        passedRadar,
        alerted: false,
        listing,
        evaluation: {
          passedRadar,
          policyAllowed: true,
          throttleAllowed: false,
          alerted: false,
          reason,
        } as AlertEvaluationResult,
      }
    }

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

      return {
        passedRadar,
        alerted,
        listing,
        evaluation: {
          passedRadar,
          policyAllowed: true,
          throttleAllowed: true,
          alerted,
          reason: sent ? 'Alerta enviado com sucesso' : 'Falha no envio do alerta',
        } as AlertEvaluationResult,
      }
    }
  }

  return {
    passedRadar,
    alerted,
    listing,
    evaluation: {
      passedRadar,
      policyAllowed: passedRadar,
      throttleAllowed: true,
      alerted: false,
      reason: passedRadar ? 'Canal de alerta nao esta habilitado' : 'Listing nao passou nos filtros do radar',
    } as AlertEvaluationResult,
  }
}

function mapRadarSeedToScannerSeed(seed: RadarListingSeed): ScannerListingSeed {
  return {
    source: seed.source,
    externalId: null,
    url: seed.sourceUrl,
    title: seed.title,
    description: seed.description,
    price: seed.price,
    city: seed.city,
    state: seed.state,
    brand: seed.brand,
    model: seed.model,
    year: seed.year,
    mileage: seed.mileage,
    fuel: null,
    transmission: null,
    images: seed.imageUrls,
    sellerName: null,
    sellerType: 'UNKNOWN',
    postedAt: null,
    rawPayload: {
      sourceContext: seed.sourceContext,
    },
  }
}

async function processListingSeed(
  seed: RadarListingSeed,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const title = seed.title || 'Anuncio monitorado'

  if (!seed.price) {
    return {
      item: { url: seed.sourceUrl, title, status: 'skipped', detail: 'Preco nao identificado.' },
      alerted: false,
    }
  }

  const normalizedListing = normalizeListingSeed(mapRadarSeedToScannerSeed(seed), {
    fallbackVehicleType: seed.type === 'MOTO' ? 'MOTORCYCLE' : 'CAR',
  })

  const persisted = await upsertNormalizedListing(userId, normalizedListing)

  if (persisted.operation === 'skipped') {
    return {
      item: {
        url: seed.sourceUrl,
        title,
        status: 'skipped',
        detail: persisted.skippedReason || 'Anuncio ignorado.',
        listingId: persisted.trashedListingId,
      },
      alerted: false,
    }
  }

  const listing = persisted.listing
  if (!listing) {
    throw new Error('Falha ao persistir listing normalizada.')
  }

  const { analysis } = await runAnalysisWithFallback({
    type: seed.type,
    title: normalizedListing.title || title,
    description: normalizedListing.description || undefined,
    price: normalizedListing.price || undefined,
    mileage: normalizedListing.mileage || undefined,
    year: normalizedListing.year || undefined,
    city: normalizedListing.city || undefined,
    sourceUrl: normalizedListing.canonicalUrl,
    sourceContext: seed.sourceContext,
    brand: normalizedListing.brand || undefined,
    model: normalizedListing.model || undefined,
  })

  const riskLevel = analysisRiskMap[analysis.nivel_risco] || 'MEDIUM'
  const estimatedMargin = parseEstimatedMarginValue(analysis.margem_estimada)
  const opportunity = evaluateOpportunity({
    baseScore: analysis.score_oportunidade,
    price: normalizedListing.price,
    avgMarketPrice: analysis.media_mercado,
    estimatedMargin,
    imageCount: normalizedListing.images.length,
    year: normalizedListing.year,
    mileage: normalizedListing.mileage,
    title: normalizedListing.title,
    description: normalizedListing.description,
    type: seed.type,
  })
  const risk = evaluateRisk({
    baseScore: analysis.score_risco,
    price: normalizedListing.price,
    avgMarketPrice: analysis.media_mercado,
    estimatedMargin,
    imageCount: normalizedListing.images.length,
    title: normalizedListing.title,
    description: normalizedListing.description,
    city: normalizedListing.city,
    state: normalizedListing.state,
  })
  const derivedRiskLevel = deriveRiskLevelFromScore(risk.score)
  const finalRiskLevel =
    derivedRiskLevel === 'HIGH' || riskLevel === 'HIGH'
      ? 'HIGH'
      : derivedRiskLevel === 'LOW' && riskLevel === 'LOW'
        ? 'LOW'
        : 'MEDIUM'

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      title: analysis.titulo || listing.title,
      opportunityScore: opportunity.score,
      riskScore: risk.score,
      riskLevel: finalRiskLevel,
      aiSummary: analysis.resumo,
      positiveSignals: Array.from(
        new Set([...(analysis.sinais_positivos || []), ...opportunity.reasons, `Confianca ${opportunity.confidenceScore}/100`])
      ).slice(0, 8),
      alertSignals: Array.from(new Set([...(analysis.sinais_alerta || []), ...risk.reasons])).slice(0, 8),
      fipePrice: analysis.fipe_estimada,
      avgMarketPrice: analysis.media_mercado,
      estimatedMargin,
      status: 'ANALYZED',
    },
  })

  const { passedRadar, alerted, evaluation } = await maybeSendAlert(updated.id, userId, normalizedConfig)

  await createListingSnapshot({
    listing: updated,
    scanRunId: options.scanRunId,
    rawPayload: {
      normalizedListing,
      sourceContext: seed.sourceContext,
      sourceSeed: {
        source: seed.source,
        sourceUrl: seed.sourceUrl,
      },
      alertEvaluation: evaluation,
    },
  })

  return {
    item: {
      url: seed.sourceUrl,
      title: updated.title,
      status: persisted.operation,
      detail: `Score ${updated.opportunityScore || 0} | risco ${updated.riskLevel || 'MEDIUM'}${passedRadar ? ' | passou no radar' : ''}`,
      listingId: updated.id,
    },
    alerted,
  }
}

export async function processUrl(
  sourceUrl: string,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>,
  options: ProcessOptions = {}
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
    normalizedConfig,
    options
  )
}

export async function processDirectResult(
  result: ScanResult,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>,
  fallbackType: 'MOTO' | 'CARRO' = 'CARRO',
  options: ProcessOptions = {}
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
    normalizedConfig,
    options
  )
}
