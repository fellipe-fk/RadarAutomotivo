// ─────────────────────────────────────────────────────────────
// /api/radar/scan — Scan do radar (manual ou automático)
//
// Funciona em dois modos:
//   1. URLs manuais cadastradas em seedUrls
//   2. Busca por modelo em fontes configuradas (OLX, Facebook, etc.)
//      via Jina.ai — sem depender de IA paga para BUSCAR
//
// A IA só é usada para ENRIQUECER a análise depois que o anúncio
// é encontrado — e tem fallback heurístico gratuito.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

import { buildAlertMessage } from '@/lib/analyzer'
import { auditLog, requireAuth } from '@/lib/auth'
import { analysisRiskMap, parseEstimatedMarginValue, runAnalysisWithFallback } from '@/lib/listing-analysis'
import { extractListingFromUrl, NotAVehicleError } from '@/lib/listing-extractor'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import { sendTelegramAlert } from '@/lib/telegram'

// ── Tipo de sumário do scan ───────────────────────────────────
type ScanSummary = {
  total: number
  created: number
  updated: number
  analyzed: number
  alerted: number
  skipped: number
  mode: 'urls' | 'search' | 'mixed'
}

type ScanItem = {
  url: string
  title?: string
  status: 'created' | 'updated' | 'skipped'
  detail: string
  listingId?: string
}

// ── Inferir tipo do veículo pelo texto ────────────────────────
function inferVehicleType(value: string): 'MOTO' | 'CARRO' {
  const n = value.toLowerCase()
  const motoTokens = [
    'moto', 'motocicleta', 'scooter',
    'xre', 'titan', 'cg ', 'biz', 'fazer', 'hornet',
    'cb 500', 'cb500', 'cb300', 'bros', 'nmax', 'pcx',
    'lander', 'tenere', 'crosser', 'ybr', 'ninja', 'factor',
  ]
  return motoTokens.some(t => n.includes(t)) ? 'MOTO' : 'CARRO'
}

// ── Gerador de URLs de busca por fonte ────────────────────────
// Cada fonte tem um padrão de URL de listagem/busca.
// Usamos Jina.ai para extrair os links individuais dessas páginas.
function buildSearchUrls(modelo: string, fonte: string): string[] {
  const q = encodeURIComponent(modelo)

  switch (fonte) {
    case 'olx':
      return [
        `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=${q}`,
        `https://www.olx.com.br/autos-e-pecas/motos?q=${q}`,
      ]
    case 'webmotors':
      return [`https://www.webmotors.com.br/carros/estoque?busca=${q}`]
    case 'icarros':
      return [`https://www.icarros.com.br/ache/lista.jsp?palavra=${q}`]
    case 'mercadolivre':
      return [`https://lista.mercadolivre.com.br/veiculos/${q}`]
    default:
      return []
  }
}

// ── Extrair links individuais de uma página de busca ─────────
async function extractLinksFromSearchPage(searchUrl: string, modelo: string): Promise<string[]> {
  try {
    const jinaUrl = `https://r.jina.ai/${searchUrl}`
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) return []

    const data = await res.json() as { data?: { content?: string; links?: Record<string, string> } }
    const links = data.data?.links || {}
    const content = data.data?.content || ''

    // Coletar links que parecem ser de anúncios individuais
    const anuncioLinks = new Set<string>()

    // Links da estrutura do Jina
    for (const [url] of Object.entries(links)) {
      if (isAnuncioUrl(url, searchUrl)) {
        anuncioLinks.add(url)
      }
    }

    // Fallback: extrair URLs do conteúdo markdown
    const urlMatches = content.match(/https?:\/\/[^\s\)\"\']+/g) || []
    for (const url of urlMatches) {
      const cleanedUrl = url.split(')')[0].trim()
      if (isAnuncioUrl(cleanedUrl, searchUrl)) {
        anuncioLinks.add(cleanedUrl)
      }
    }

    // Filtrar por modelo (evitar resultados irrelevantes)
    const modeloNorm = modelo.toLowerCase()
    const filtered = Array.from(anuncioLinks).filter(url => {
      const urlLower = url.toLowerCase()
      // URLs de anúncio geralmente têm ID numérico no final
      return /\/\d{6,}/.test(url) || urlLower.includes(modeloNorm.split(' ')[0])
    })

    return filtered.slice(0, 5) // máx 5 links por página de busca
  } catch {
    return []
  }
}

function isAnuncioUrl(url: string, searchUrl: string): boolean {
  try {
    const parsed = new URL(url)
    const search = new URL(searchUrl)

    // Deve ser do mesmo domínio
    if (!parsed.hostname.includes(search.hostname.replace('www.', ''))) return false

    // Não deve ser a própria página de busca
    if (url === searchUrl) return false

    // Deve ter path mais profundo (anúncio individual)
    const pathDepth = parsed.pathname.split('/').filter(Boolean).length
    if (pathDepth < 2) return false

    // Não deve ser página de categoria ou navegação
    const skipPaths = ['/autos-e-pecas', '/carros', '/motos', '/busca', '/lista', '/estoque']
    if (skipPaths.some(p => parsed.pathname === p || parsed.pathname === p + '/')) return false

    return true
  } catch {
    return false
  }
}

// ── Processar um único anúncio (URL) ─────────────────────────
async function processUrl(
  sourceUrl: string,
  userId: string,
  normalizedConfig: ReturnType<typeof normalizeRadarConfig>
): Promise<{ item: ScanItem; alerted: boolean }> {
  const extracted = await extractListingFromUrl(sourceUrl)
  const title = extracted.title || 'Anúncio monitorado'

  if (!extracted.price) {
    return {
      item: { url: sourceUrl, title, status: 'skipped', detail: 'Preço não identificado.' },
      alerted: false,
    }
  }

  const type = inferVehicleType(`${title} ${extracted.brand || ''} ${extracted.model || ''}`)

  // Verificar se já existe no banco (deduplicação por URL)
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

  // Enriquecer com análise (IA ou heurística local — sem custo obrigatório)
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

  // Verificar se passa nos filtros do radar
  const passouRadar = matchesRadar(updated, normalizedConfig)
  let alerted = false

  if (passouRadar && !updated.alertSent) {
    // Buscar usuário para checar telegramEnabled
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
      detail: `Score ${updated.opportunityScore || 0} | risco ${updated.riskLevel || 'MEDIUM'}${passouRadar ? ' | ✓ passou no radar' : ''}`,
      listingId: updated.id,
    },
    alerted,
  }
}

// ── Rota principal ────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    let config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })

    if (!config) {
      config = await prisma.radarConfig.create({ data: { userId: user.id } })
    }

    const normalizedConfig = normalizeRadarConfig(config)
    const summary: ScanSummary = {
      total: 0,
      created: 0,
      updated: 0,
      analyzed: 0,
      alerted: 0,
      skipped: 0,
      mode: 'mixed',
    }
    const items: ScanItem[] = []

    // ── Modo 1: URLs manuais cadastradas ──────────────────────
    const manualUrls = Array.from(
      new Set((config.seedUrls || []).map(u => u.trim()).filter(Boolean))
    ).slice(0, 20)

    // ── Modo 2: Busca por modelo nas fontes configuradas ──────
    const searchUrls: string[] = []

    if (normalizedConfig.modelos.length > 0 && normalizedConfig.fontes.length > 0) {
      for (const modelo of normalizedConfig.modelos.slice(0, 3)) { // máx 3 modelos por scan
        for (const fonte of normalizedConfig.fontes.filter(f => f !== 'manual').slice(0, 3)) {
          const urls = buildSearchUrls(modelo, fonte)
          for (const searchUrl of urls) {
            const links = await extractLinksFromSearchPage(searchUrl, modelo)
            searchUrls.push(...links)
          }
        }
      }
    }

    // Combinar e deduplicar URLs
    const allUrls = Array.from(new Set([...manualUrls, ...searchUrls])).slice(0, 30)

    if (allUrls.length === 0) {
      return NextResponse.json({
        error:
          'Nenhuma URL encontrada para processar. Adicione URLs manualmente ou configure modelos e fontes para busca automática.',
        hint: 'Configure pelo menos um modelo (ex: "XRE 300") e uma fonte (ex: OLX) no radar.',
      }, { status: 400 })
    }

    summary.total = allUrls.length
    summary.mode = manualUrls.length > 0 && searchUrls.length > 0
      ? 'mixed'
      : searchUrls.length > 0
        ? 'search'
        : 'urls'

    // Processar cada URL
    for (const sourceUrl of allUrls) {
      try {
        const { item, alerted } = await processUrl(sourceUrl, user.id, normalizedConfig)
        items.push(item)

        if (item.status === 'created') summary.created++
        else if (item.status === 'updated') summary.updated++
        else summary.skipped++

        if (item.status !== 'skipped') summary.analyzed++
        if (alerted) summary.alerted++
      } catch (error) {
        summary.skipped++

        const detail =
          error instanceof NotAVehicleError
            ? `[Não é veículo] ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Falha ao processar esta URL.'

        items.push({ url: sourceUrl, status: 'skipped', detail })
      }
    }

    await auditLog(user.id, 'radar.scan', request, summary)

    return NextResponse.json({ summary, items })
  } catch (error) {
    if (error instanceof Error && /(autenticado|token|sessao)/i.test(error.message)) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    console.error('[radar/scan]', error)
    return NextResponse.json({ error: 'Erro ao rodar o scan.' }, { status: 500 })
  }
}
