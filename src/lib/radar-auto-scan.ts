import { buildAlertMessage } from '@/lib/analyzer'
import { analysisRiskMap, parseEstimatedMarginValue, runAnalysisWithFallback } from '@/lib/listing-analysis'
import { extractListingFromUrl } from '@/lib/listing-extractor'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import { sendTelegramAlert } from '@/lib/telegram'

export async function processUrl(
  sourceUrl: string,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>
): Promise<{ item: { url: string; title?: string; status: 'created' | 'updated' | 'skipped'; detail: string; listingId?: string }; alerted: boolean }> {
  const extracted = await extractListingFromUrl(sourceUrl)
  const title = extracted.title || 'Anuncio monitorado'

  if (!extracted.price) {
    return {
      item: { url: sourceUrl, title, status: 'skipped', detail: 'Preco nao identificado.' },
      alerted: false,
    }
  }

  const type = extracted.detectedVehicleType || 'CARRO'

  const existing = await prisma.listing.findFirst({
    where: { userId, sourceUrl: extracted.resolvedUrl },
  })

  const baseData = {
    title,
    description: extracted.description,
    price: extracted.price,
    type,
    source: extracted.source,
    sourceUrl: extracted.resolvedUrl,
    imageUrls: extracted.imageUrls,
    brand: extracted.brand,
    model: extracted.model,
    year: extracted.year,
    mileage: extracted.mileage,
    city: extracted.city,
    state: extracted.state,
    status: 'PENDING' as const,
  }

  const listing = existing
    ? await prisma.listing.update({ where: { id: existing.id }, data: baseData })
    : await prisma.listing.create({ data: { userId, ...baseData } })

  const { analysis } = await runAnalysisWithFallback({
    type,
    title,
    description: extracted.description,
    price: extracted.price,
    mileage: extracted.mileage || undefined,
    year: extracted.year || undefined,
    city: extracted.city || undefined,
    sourceUrl: extracted.resolvedUrl,
    sourceContext: extracted.sourceContext,
    brand: extracted.brand || undefined,
    model: extracted.model || undefined,
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

  const passouRadar = matchesRadar(updated, normalizedConfig)
  let alerted = false

  if (passouRadar && !updated.alertSent) {
    const userConfig = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramEnabled: true, telegramChatId: true },
    })

    if (userConfig?.telegramEnabled && userConfig.telegramChatId) {
      const message = buildAlertMessage({
        title: updated.title,
        price: updated.price,
        city: updated.city || undefined,
        distanceKm: updated.distanceKm || undefined,
        opportunityScore: updated.opportunityScore || undefined,
        riskLevel: updated.riskLevel || undefined,
        estimatedMargin: updated.estimatedMargin || undefined,
        aiSummary: updated.aiSummary || undefined,
        sourceUrl: updated.sourceUrl || undefined,
      })

      const sent = await sendTelegramAlert(message, userConfig.telegramChatId)

      await prisma.alert.create({
        data: {
          userId,
          listingId: updated.id,
          channel: 'telegram',
          message,
          sent,
          sentAt: sent ? new Date() : undefined,
          errorMsg: sent ? undefined : 'Falha no envio do alerta.',
        },
      })

      if (sent) {
        await prisma.listing.update({
          where: { id: updated.id },
          data: { alertSent: true, status: 'ALERTED' },
        })
        alerted = true
      }
    }
  }

  return {
    item: {
      url: sourceUrl,
      title: updated.title,
      status: existing ? 'updated' : 'created',
      detail: `Score ${updated.opportunityScore || 0} | risco ${updated.riskLevel || 'MEDIUM'}${passouRadar ? ' | passou no radar' : ''}`,
      listingId: updated.id,
    },
    alerted,
  }
}
