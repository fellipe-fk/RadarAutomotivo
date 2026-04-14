import { NextRequest, NextResponse } from 'next/server'

import { buildAlertMessage } from '@/lib/analyzer'
import { auditLog, requireAuth } from '@/lib/auth'
import { analysisRiskMap, parseEstimatedMarginValue, runAnalysisWithFallback } from '@/lib/listing-analysis'
import { extractListingFromUrl, NotAVehicleError } from '@/lib/listing-extractor'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import { sendTelegramAlert } from '@/lib/telegram'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function inferVehicleType(value: string): 'MOTO' | 'CARRO' {
  const normalized = value.toLowerCase()
  const motoTokens = ['moto', 'xre', 'titan', 'cg', 'biz', 'fazer', 'hornet', 'cb ', 'bros', 'nmax', 'pcx', 'lander']
  return motoTokens.some((token) => normalized.includes(token)) ? 'MOTO' : 'CARRO'
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    let config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })

    if (!config) {
      config = await prisma.radarConfig.create({ data: { userId: user.id } })
    }

    const urls = Array.from(new Set((config.seedUrls || []).map((entry) => entry.trim()).filter(Boolean))).slice(0, 20)

    if (urls.length === 0) {
      return NextResponse.json({ error: 'Adicione ao menos uma URL monitorada para rodar o scan real.' }, { status: 400 })
    }

    const normalizedConfig = normalizeRadarConfig(config)
    const summary = {
      total: urls.length,
      created: 0,
      updated: 0,
      analyzed: 0,
      alerted: 0,
      skipped: 0,
    }

    const items: Array<{
      url: string
      title?: string
      status: 'created' | 'updated' | 'skipped'
      detail: string
      listingId?: string
    }> = []

    for (const sourceUrl of urls) {
      try {
        const extracted = await extractListingFromUrl(sourceUrl)
        const title = extracted.title || 'Anuncio monitorado'
        const type = inferVehicleType(`${title} ${extracted.brand || ''} ${extracted.model || ''}`)

        if (!extracted.price) {
          summary.skipped += 1
          items.push({
            url: sourceUrl,
            title,
            status: 'skipped',
            detail: 'Nao foi possivel identificar preco real nesta URL.',
          })
          continue
        }

        const existing = await prisma.listing.findFirst({
          where: {
            userId: user.id,
            sourceUrl: extracted.resolvedUrl,
          },
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
          ? await prisma.listing.update({
              where: { id: existing.id },
              data: baseData,
            })
          : await prisma.listing.create({
              data: {
                userId: user.id,
                ...baseData,
              },
            })

        const analyzeInput = {
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
        } as const

        const { analysis } = await runAnalysisWithFallback(analyzeInput)
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

        summary.analyzed += 1
        summary[existing ? 'updated' : 'created'] += 1

        if (matchesRadar(updated, normalizedConfig) && !updated.alertSent) {
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

          const sent = await sendTelegramAlert(message, user.telegramChatId || undefined)

          await prisma.alert.create({
            data: {
              userId: user.id,
              listingId: updated.id,
              channel: 'telegram',
              message,
              sent,
              sentAt: sent ? new Date() : undefined,
              errorMsg: sent ? undefined : 'Falha no envio do alerta do scan real.',
            },
          })

          if (sent) {
            summary.alerted += 1
            await prisma.listing.update({
              where: { id: updated.id },
              data: { alertSent: true, status: 'ALERTED' },
            })
          }
        }

        items.push({
          url: sourceUrl,
          title: updated.title,
          status: existing ? 'updated' : 'created',
          detail: `Score ${updated.opportunityScore || 0} | risco ${updated.riskLevel || 'MEDIUM'}`,
          listingId: updated.id,
        })
      } catch (error) {
        summary.skipped += 1

        // URL de não-veículo: sinalizar claramente no log do scan
        const detail =
          error instanceof NotAVehicleError
            ? `[URL inválida] ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Falha no scan desta URL.'

        items.push({
          url: sourceUrl,
          status: 'skipped',
          detail,
        })
      }
    }

    await auditLog(user.id, 'radar.scan', request, summary)

    return NextResponse.json({ summary, items })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao rodar scan real do radar:', error)
    return NextResponse.json({ error: 'Erro ao rodar scan real do radar.' }, { status: 500 })
  }
}
