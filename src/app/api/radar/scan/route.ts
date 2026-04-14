import { NextRequest, NextResponse } from 'next/server'

import { auditLog, requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import { extractListingFromUrl, NotAVehicleError, isPriceValid } from '@/lib/listing-extractor'
import { processUrl } from '@/lib/radar-auto-scan'

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
    const diagnostics: Array<{ modelo: string; fonte: string; searchUrl: string; found: number }> = []

    const manualUrls = Array.from(new Set((config.seedUrls || []).map((u) => u.trim()).filter(Boolean))).slice(0, 20)

    const searchUrls: string[] = []
    if (normalizedConfig.modelos.length > 0 && normalizedConfig.fontes.length > 0) {
      for (const modelo of normalizedConfig.modelos.slice(0, 3)) {
        for (const fonte of normalizedConfig.fontes.filter((f) => f !== 'manual').map(normalizeSourceName).slice(0, 8)) {
          for (const searchUrl of buildSearchUrls(modelo, fonte)) {
            const links = await extractLinksFromSearchPage(searchUrl, modelo)
            searchUrls.push(...links)
            diagnostics.push({ modelo, fonte, searchUrl, found: links.length })
          }
        }
      }
    }

    const allUrls = Array.from(new Set([...manualUrls, ...searchUrls])).slice(0, 30)

    summary.total = allUrls.length
    summary.mode = manualUrls.length > 0 && searchUrls.length > 0 ? 'mixed' : searchUrls.length > 0 ? 'search' : 'urls'

    if (allUrls.length === 0) {
      return NextResponse.json(
        {
          error: 'Nenhuma URL encontrada para processar.',
          hint: 'Adicione URLs manuais em seedUrls ou configure pelo menos um modelo e uma fonte válidos.',
          diagnostics: {
            manualUrls: manualUrls.length,
            searchUrls: searchUrls.length,
            modelos: normalizedConfig.modelos.length,
            fontes: normalizedConfig.fontes.length,
            searches: diagnostics,
          },
          summary,
          items,
        },
        { status: 400 }
      )
    }

    for (const sourceUrl of allUrls) {
      try {
        const { item } = await processUrl(sourceUrl, user.id, normalizedConfig)
        items.push(item)

        if (item.status === 'created') summary.created += 1
        else if (item.status === 'updated') summary.updated += 1
        else summary.skipped += 1

        if (item.status !== 'skipped') summary.analyzed += 1
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

    return NextResponse.json({ summary, items, diagnostics })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao rodar scan real do radar:', error)
    return NextResponse.json({ error: 'Erro ao rodar scan real do radar.' }, { status: 500 })
  }
}
