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
  const motoTokens = [
    'moto',
    'motocicleta',
    'scooter',
    'xre',
    'titan',
    'cg',
    'biz',
    'fazer',
    'hornet',
    'cb ',
    'cb500',
    'cb300',
    'bros',
    'nmax',
    'pcx',
    'lander',
    'tenere',
    'crosser',
    'ybr',
    'ninja',
    'factor',
  ]
  return motoTokens.some((token) => normalized.includes(token)) ? 'MOTO' : 'CARRO'
}

function normalizeSourceName(source: string) {
  const value = source.toLowerCase().trim()

  if (value.includes('olx pro')) return 'olxpro'
  if (value.includes('olx')) return 'olx'
  if (value.includes('facebook')) return 'facebook'
  if (value.includes('webmotors')) return 'webmotors'
  if (value.includes('icarros')) return 'icarros'
  if (value.includes('mercado livre')) return 'mercadolivre'
  if (value.includes('kavak')) return 'kavak'
  if (value.includes('quero')) return 'queroquero'
  if (value.includes('manual')) return 'manual'
  return value
}

function buildSearchUrls(modelo: string, fonte: string): string[] {
  const q = encodeURIComponent(modelo)

  switch (fonte) {
    case 'olx':
    case 'olxpro':
      return [
        `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=${q}`,
        `https://www.olx.com.br/autos-e-pecas/motos?q=${q}`,
      ]
    case 'webmotors':
      return [`https://www.webmotors.com.br/carros/estoque?busca=${q}`]
    case 'facebook':
      return [`https://www.facebook.com/marketplace/search/?query=${q}`]
    case 'icarros':
      return [`https://www.icarros.com.br/ache/lista.jsp?palavra=${q}`]
    case 'mercadolivre':
      return [`https://lista.mercadolivre.com.br/veiculos/${q}`]
    case 'kavak':
      return [`https://www.kavak.com/br/seminovos/${q}`]
    case 'queroquero':
      return [`https://www.queroquero.com.br/busca?q=${q}`]
    default:
      return []
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, application/json;q=0.9, */*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) return ''
  return response.text()
}

function extractUrlsFromContent(content: string, searchUrl: string) {
  const rawMatches = content.match(/https?:\/\/[^\s\)\"\']+/g) || []
  const urls = new Set<string>()

  for (const rawUrl of rawMatches) {
    const cleanedUrl = rawUrl.split(')')[0].trim()

    try {
      const parsed = new URL(cleanedUrl)
      const search = new URL(searchUrl)

      if (!parsed.hostname.includes(search.hostname.replace('www.', ''))) continue
      if (cleanedUrl === searchUrl) continue

      const pathDepth = parsed.pathname.split('/').filter(Boolean).length
      if (pathDepth < 2) continue

      urls.add(cleanedUrl)
    } catch {
      continue
    }
  }

  return Array.from(urls)
}

async function extractLinksFromSearchPage(searchUrl: string, modelo: string): Promise<string[]> {
  try {
    const candidates: string[] = []

    const jinaUrl = `https://r.jina.ai/http://${searchUrl.replace(/^https?:\/\//, '')}`
    const jinaText = await fetchText(jinaUrl)

    if (jinaText) {
      candidates.push(...extractUrlsFromContent(jinaText, searchUrl))
    }

    const directText = await fetchText(searchUrl)
    if (directText) {
      candidates.push(...extractUrlsFromContent(directText, searchUrl))
    }

    const modeloNorm = modelo.toLowerCase()
    const filtered = Array.from(new Set(candidates)).filter((url) => {
      const urlLower = url.toLowerCase()
      return /\/\d{6,}/.test(url) || urlLower.includes(modeloNorm.split(' ')[0])
    })

    return filtered.slice(0, 8)
  } catch {
    return []
  }
}

async function processUrl(
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

  const type = inferVehicleType(`${title} ${extracted.brand || ''} ${extracted.model || ''}`)

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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    let config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })

    if (!config) {
      config = await prisma.radarConfig.create({ data: { userId: user.id } })
    }

    const normalizedConfig = normalizeRadarConfig(config)
    const summary = {
      total: 0,
      created: 0,
      updated: 0,
      analyzed: 0,
      alerted: 0,
      skipped: 0,
      mode: 'mixed' as 'mixed' | 'search' | 'urls',
    }
    const items: Array<{ url: string; title?: string; status: 'created' | 'updated' | 'skipped'; detail: string; listingId?: string }> = []

    const manualUrls = Array.from(new Set((config.seedUrls || []).map((u) => u.trim()).filter(Boolean))).slice(0, 20)

    const searchUrls: string[] = []
    if (normalizedConfig.modelos.length > 0 && normalizedConfig.fontes.length > 0) {
      for (const modelo of normalizedConfig.modelos.slice(0, 3)) {
        for (const fonte of normalizedConfig.fontes.filter((f) => f !== 'manual').map(normalizeSourceName).slice(0, 8)) {
          for (const searchUrl of buildSearchUrls(modelo, fonte)) {
            const links = await extractLinksFromSearchPage(searchUrl, modelo)
            searchUrls.push(...links)
          }
        }
      }
    }

    const allUrls = Array.from(new Set([...manualUrls, ...searchUrls])).slice(0, 30)

    if (allUrls.length === 0) {
      return NextResponse.json(
        {
          error: 'Nenhuma URL encontrada para processar. Adicione URLs manuais ou configure modelos e fontes.',
          hint: 'Configure pelo menos um modelo e uma fonte no radar.',
        },
        { status: 400 }
      )
    }

    summary.total = allUrls.length
    summary.mode = manualUrls.length > 0 && searchUrls.length > 0 ? 'mixed' : searchUrls.length > 0 ? 'search' : 'urls'

    for (const sourceUrl of allUrls) {
      try {
        const { item, alerted } = await processUrl(sourceUrl, user.id, normalizedConfig)
        items.push(item)

        if (item.status === 'created') summary.created += 1
        else if (item.status === 'updated') summary.updated += 1
        else summary.skipped += 1

        if (item.status !== 'skipped') summary.analyzed += 1
        if (alerted) summary.alerted += 1
      } catch (error) {
        summary.skipped += 1

        const detail =
          error instanceof NotAVehicleError
            ? `[Nao e veículo] ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Falha ao processar esta URL.'

        items.push({ url: sourceUrl, status: 'skipped', detail })
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
