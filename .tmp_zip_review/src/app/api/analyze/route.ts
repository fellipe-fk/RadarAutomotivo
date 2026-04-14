import { NextRequest, NextResponse } from 'next/server'

import { buildAlertMessage } from '@/lib/analyzer'
import { requireAuth } from '@/lib/auth'
import { analysisRiskMap, parseEstimatedMarginValue, runAnalysisWithFallback } from '@/lib/listing-analysis'
import { extractListingFromUrl, NotAVehicleError } from '@/lib/listing-extractor'
import { prisma } from '@/lib/prisma'
import { sendTelegramAlert } from '@/lib/telegram'

function parseNumberish(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined

  const compact = value.trim().replace(/\s+/g, '')
  const normalized =
    compact.includes(',') && compact.includes('.')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.includes(',')
        ? compact.replace(',', '.')
        : compact
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const { type, title, description, price, mileage, year, city, sourceUrl, imageUrls } = body

    const cleanSourceUrl = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
    const manualTitle = typeof title === 'string' ? title.trim() : ''
    const manualDescription = typeof description === 'string' ? description.trim() : ''
    const manualCity = typeof city === 'string' ? city.trim() : ''

    let extracted:
      | Awaited<ReturnType<typeof extractListingFromUrl>>
      | null = null

    if (cleanSourceUrl) {
      try {
        extracted = await extractListingFromUrl(cleanSourceUrl)
      } catch (error) {
        // Erro de conteúdo que não é veículo — retornar imediatamente, não fazer fallback manual
        if (error instanceof NotAVehicleError) {
          return NextResponse.json(
            {
              error: error.message,
              code: 'NOT_A_VEHICLE',
            },
            { status: 422 }
          )
        }

        // Para outros erros de extração: só lança se não tiver dados manuais
        if (!manualTitle && !manualDescription && !parseNumberish(price)) {
          throw error
        }
      }
    }

    const resolvedPrice = parseNumberish(price) ?? extracted?.price
    const resolvedMileage = parseNumberish(mileage) ?? extracted?.mileage
    const resolvedYear = parseNumberish(year) ?? extracted?.year
    const resolvedTitle = manualTitle || extracted?.title || `${type} anunciado`
    const resolvedDescription = manualDescription || extracted?.description
    const resolvedCity = manualCity || extracted?.city
    const resolvedImageUrls =
      Array.isArray(imageUrls) && imageUrls.length > 0
        ? imageUrls.filter((entry): entry is string => typeof entry === 'string')
        : extracted?.imageUrls || []
    const resolvedSource =
      extracted?.source || (cleanSourceUrl.includes('facebook') ? 'facebook' : cleanSourceUrl.includes('olx') ? 'olx' : 'manual')
    const resolvedSourceUrl = extracted?.resolvedUrl || cleanSourceUrl || undefined

    if (!type) {
      return NextResponse.json({ error: 'Tipo do veiculo e obrigatorio.' }, { status: 400 })
    }

    if (!cleanSourceUrl && !manualTitle && !manualDescription) {
      return NextResponse.json({ error: 'Cole o link do anuncio ou preencha os dados manualmente.' }, { status: 400 })
    }

    if (!resolvedPrice) {
      return NextResponse.json(
        { error: 'Nao foi possivel identificar o preco do anuncio. Informe o preco manualmente ou use outro link.' },
        { status: 400 }
      )
    }

    const listing = await prisma.listing.create({
      data: {
        userId: user.id,
        title: resolvedTitle,
        description: resolvedDescription,
        price: resolvedPrice,
        type,
        source: resolvedSource,
        sourceUrl: resolvedSourceUrl,
        imageUrls: resolvedImageUrls,
        brand: extracted?.brand,
        model: extracted?.model,
        year: resolvedYear ? Math.round(resolvedYear) : undefined,
        mileage: resolvedMileage ? Math.round(resolvedMileage) : undefined,
        city: resolvedCity,
        state: extracted?.state,
        status: 'PENDING',
      },
    })

    const analyzeInput = {
      type,
      title: resolvedTitle,
      description: resolvedDescription,
      price: resolvedPrice,
      mileage: resolvedMileage ? Math.round(resolvedMileage) : undefined,
      year: resolvedYear ? Math.round(resolvedYear) : undefined,
      city: resolvedCity,
      sourceUrl: resolvedSourceUrl,
      sourceContext: extracted?.sourceContext,
      brand: extracted?.brand,
      model: extracted?.model,
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

    const config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })
    const shouldAlert =
      config &&
      analysis.score_oportunidade >= (config.scoreAlerta || 75) &&
      ((config.riscoMax === 'HIGH' ||
        (config.riscoMax === 'MEDIUM' && riskLevel !== 'HIGH') ||
        (config.riscoMax === 'LOW' && riskLevel === 'LOW')) as boolean)

    if (shouldAlert) {
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
          listingId: listing.id,
          channel: 'telegram',
          message,
          sent,
          sentAt: sent ? new Date() : undefined,
        },
      })

      if (sent) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { alertSent: true, status: 'ALERTED' },
        })
      }
    }

    return NextResponse.json({ listing: updated, analysis })
  } catch (error) {
    console.error('Erro na analise:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno na analise' },
      { status: 500 }
    )
  }
}
