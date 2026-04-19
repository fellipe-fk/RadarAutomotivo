import type { ListingSeed } from '@/lib/scanner/contracts/listing-seed'
import { icarrosConnector } from '@/lib/scanner/connectors/icarros'
import { kavakConnector } from '@/lib/scanner/connectors/kavak'
import { mercadoLivreConnector } from '@/lib/scanner/connectors/mercadolivre'
import { olxConnector } from '@/lib/scanner/connectors/olx'
import { webmotorsConnector } from '@/lib/scanner/connectors/webmotors'
import type { ConnectorVehicleType } from '@/lib/scanner/connectors/types'

export type ScanResult = {
  url: string
  title?: string
  price?: number
  city?: string
  state?: string
  year?: number
  mileage?: number
  imageUrl?: string
  brand?: string
  model?: string
  source: string
}

type LegacyVehicleType = 'MOTO' | 'CARRO' | 'TODOS'

export type SourceSearchDiagnostic = {
  source: string
  strategy: 'direct' | 'links'
  status: 'found' | 'empty' | 'ignored'
  detail: string
  count: number
}

function slugifySearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
}

function normalizeComparableUrl(value: string) {
  try {
    const parsed = new URL(value)
    parsed.hash = ''
    parsed.protocol = 'https:'
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase()
    parsed.searchParams.sort()

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    }

    return `${parsed.hostname}${parsed.pathname}${parsed.search ? `?${parsed.searchParams.toString()}` : ''}`
  } catch {
    return value.trim().toLowerCase()
  }
}

function normalizeAbsoluteUrl(candidateUrl: string) {
  try {
    const parsed = new URL(candidateUrl)
    parsed.hash = ''

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    }

    return parsed.toString()
  } catch {
    return candidateUrl.trim()
  }
}

function getSourceDomainFamily(url: URL) {
  const hostname = url.hostname.replace(/^www\./, '').toLowerCase()

  if (hostname.includes('mercadolivre.com.br')) return 'mercadolivre.com.br'
  if (hostname.includes('olx.com.br')) return 'olx.com.br'

  return hostname
}

function isSearchResultPage(url: URL) {
  const path = url.pathname.toLowerCase()
  const search = url.search.toLowerCase()

  return (
    search.includes('q=') ||
    search.includes('busca=') ||
    search.includes('palavra=') ||
    path.includes('/estoque') ||
    path.includes('/lista') ||
    path.includes('/busca') ||
    path.includes('/seminovos')
  )
}

function isLikelyListingUrl(candidateUrl: string, searchUrl: string) {
  try {
    const candidate = new URL(candidateUrl)
    const search = new URL(searchUrl)
    const hostname = candidate.hostname.replace(/^www\./, '').toLowerCase()
    const pathname = candidate.pathname.toLowerCase()
    const searchFamily = getSourceDomainFamily(search)
    const candidateFamily = getSourceDomainFamily(candidate)

    if (normalizeComparableUrl(candidateUrl) === normalizeComparableUrl(searchUrl)) {
      return false
    }

    if (isSearchResultPage(candidate)) {
      return false
    }

    if (candidateFamily !== searchFamily) {
      return false
    }

    if (
      hostname.startsWith('img.') ||
      hostname.startsWith('static.') ||
      hostname.startsWith('images.') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.jpeg') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.webp') ||
      pathname.endsWith('.gif')
    ) {
      return false
    }

    if (hostname.includes('mercadolivre')) {
      return pathname.includes('/mlb-') || pathname.includes('/MLB-')
    }

    if (hostname.includes('olx')) {
      return pathname.includes('/item/') || (/\b\d{7,}\b/.test(pathname) && !pathname.includes('/autos-e-pecas/'))
    }

    return false
  } catch {
    return false
  }
}

function decodeEscapedContent(value: string) {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
}

function extractUrlsFromContent(content: string, searchUrl: string) {
  const normalizedContent = decodeEscapedContent(content)
  const rawMatches = normalizedContent.match(/https?:\/\/[^\s\)"'<>\]\\]+/g) || []
  const urls = new Set<string>()

  for (const rawUrl of rawMatches) {
    const cleanedUrl = rawUrl.split(')')[0].trim()

    if (!isLikelyListingUrl(cleanedUrl, searchUrl)) {
      continue
    }

    urls.add(normalizeAbsoluteUrl(cleanedUrl))
  }

  return Array.from(urls)
}

async function fetchSearchText(searchUrl: string) {
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  }

  try {
    const response = await fetch(searchUrl, {
      headers,
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })

    if (response.ok) {
      return response.text()
    }
  } catch {
    // fallback below
  }

  const jinaUrl = `https://r.jina.ai/http://${searchUrl.replace(/^https?:\/\//, '')}`
  const fallbackResponse = await fetch(jinaUrl, {
    headers: {
      Accept: 'text/plain, application/json;q=0.9, */*;q=0.8',
      'User-Agent': headers['User-Agent'],
    },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })

  if (!fallbackResponse.ok) {
    throw new Error(`Search page fallback failed with status ${fallbackResponse.status}`)
  }

  return fallbackResponse.text()
}

function buildFallbackSearchUrls(source: 'mercadolivre' | 'olx', modelo: string, tipo: LegacyVehicleType) {
  const q = encodeURIComponent(modelo)
  const slug = slugifySearchTerm(modelo)

  if (source === 'mercadolivre') {
    return tipo === 'MOTO'
      ? [`https://lista.mercadolivre.com.br/veiculos/motos/${slug}`]
      : tipo === 'CARRO'
        ? [`https://lista.mercadolivre.com.br/veiculos/carros-caminhonetes/${slug}`]
        : [
            `https://lista.mercadolivre.com.br/veiculos/motos/${slug}`,
            `https://lista.mercadolivre.com.br/veiculos/carros-caminhonetes/${slug}`,
          ]
  }

  return tipo === 'MOTO'
    ? [`https://www.olx.com.br/autos-e-pecas/motos?q=${q}`]
    : tipo === 'CARRO'
      ? [`https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=${q}`]
      : [
          `https://www.olx.com.br/autos-e-pecas/motos?q=${q}`,
          `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=${q}`,
        ]
}

async function searchFallbackListingLinks(
  source: 'mercadolivre' | 'olx',
  modelo: string,
  tipo: LegacyVehicleType,
  maxResults: number
) {
  const urls = new Set<string>()
  const searchUrls = buildFallbackSearchUrls(source, modelo, tipo)

  for (const searchUrl of searchUrls) {
    try {
      const text = await fetchSearchText(searchUrl)
      const extractedUrls = extractUrlsFromContent(text, searchUrl)
      const firstTerm = modelo.toLowerCase().split(/\s+/)[0] || ''

      for (const candidateUrl of extractedUrls) {
        const comparable = candidateUrl.toLowerCase()
        if (!firstTerm || comparable.includes(firstTerm) || /\b\d{5,}\b/.test(comparable)) {
          urls.add(candidateUrl)
        }
      }
    } catch (error) {
      console.warn(
        `[${source}] fallback de pagina indisponivel para ${searchUrl}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  return Array.from(urls).slice(0, maxResults)
}

function expandVehicleTypes(tipo: LegacyVehicleType): ConnectorVehicleType[] {
  if (tipo === 'MOTO') return ['MOTORCYCLE']
  if (tipo === 'CARRO') return ['CAR']
  return ['MOTORCYCLE', 'CAR']
}

function mapSeedToScanResult(seed: ListingSeed): ScanResult {
  return {
    url: seed.url,
    title: seed.title || undefined,
    price: seed.price ?? undefined,
    city: seed.city || undefined,
    state: seed.state || undefined,
    year: seed.year ?? undefined,
    mileage: seed.mileage ?? undefined,
    imageUrl: seed.images[0] || undefined,
    brand: seed.brand || undefined,
    model: seed.model || undefined,
    source: seed.source,
  }
}

function dedupeScanResults(results: ScanResult[]) {
  const deduped = new Map<string, ScanResult>()

  for (const result of results) {
    deduped.set(result.url, result)
  }

  return Array.from(deduped.values())
}

export async function searchMercadoLivre(modelo: string, tipo: LegacyVehicleType = 'TODOS', maxResults = 20): Promise<ScanResult[]> {
  const vehicleTypes = expandVehicleTypes(tipo)
  const batches = await Promise.all(
    vehicleTypes.map((vehicleType) =>
      mercadoLivreConnector.search({
        query: modelo,
        vehicleType,
        limit: maxResults,
      })
    )
  )

  return dedupeScanResults(batches.flat().map(mapSeedToScanResult)).slice(0, maxResults)
}

export async function searchOlxRss(modelo: string, tipo: LegacyVehicleType = 'TODOS', maxResults = 10): Promise<string[]> {
  const vehicleTypes = expandVehicleTypes(tipo)
  const batches = await Promise.all(
    vehicleTypes.map((vehicleType) =>
      olxConnector.search({
        query: modelo,
        vehicleType,
        limit: maxResults,
      })
    )
  )

  const links = new Set<string>()

  for (const seed of batches.flat()) {
    links.add(seed.url)
  }

  return Array.from(links).slice(0, maxResults)
}

async function searchConnectorLinks(
  modelo: string,
  tipo: LegacyVehicleType,
  maxResults: number,
  searchFn: (params: { query: string; vehicleType: ConnectorVehicleType; limit: number }) => Promise<ListingSeed[]>
) {
  const vehicleTypes = expandVehicleTypes(tipo)
  const batches = await Promise.all(
    vehicleTypes.map((vehicleType) =>
      searchFn({
        query: modelo,
        vehicleType,
        limit: maxResults,
      })
    )
  )

  const links = new Set<string>()

  for (const seed of batches.flat()) {
    links.add(seed.url)
  }

  return Array.from(links).slice(0, maxResults)
}

export async function searchWebmotors(modelo: string, tipo: LegacyVehicleType = 'TODOS', maxResults = 10): Promise<string[]> {
  return searchConnectorLinks(modelo, tipo, maxResults, (params) => webmotorsConnector.search(params))
}

export async function searchICarros(modelo: string, tipo: LegacyVehicleType = 'TODOS', maxResults = 10): Promise<string[]> {
  return searchConnectorLinks(modelo, tipo, maxResults, (params) => icarrosConnector.search(params))
}

export async function searchKavak(modelo: string, tipo: LegacyVehicleType = 'TODOS', maxResults = 10): Promise<string[]> {
  return searchConnectorLinks(modelo, tipo, maxResults, (params) => kavakConnector.search(params))
}

export async function searchFreeSources(
  modelo: string,
  tipo: LegacyVehicleType,
  fontes: string[]
): Promise<{ directResults: ScanResult[]; linkUrls: string[]; sourceDiagnostics: SourceSearchDiagnostic[] }> {
  const normalizedSources = fontes.map((entry) => entry.toLowerCase().trim())
  const directResults: ScanResult[] = []
  const linkUrls: string[] = []
  const sourceDiagnostics: SourceSearchDiagnostic[] = []

  const pushDiagnostic = (diagnostic: SourceSearchDiagnostic) => {
    sourceDiagnostics.push(diagnostic)
  }

  if (normalizedSources.includes('mercadolivre') || normalizedSources.includes('mercado livre')) {
    const results = await searchMercadoLivre(modelo, tipo)
    const fallbackLinks = results.length === 0 ? await searchFallbackListingLinks('mercadolivre', modelo, tipo, 12) : []
    directResults.push(...results)
    linkUrls.push(...fallbackLinks)
    pushDiagnostic({
      source: 'mercadolivre',
      strategy: results.length > 0 ? 'direct' : 'links',
      status: results.length > 0 || fallbackLinks.length > 0 ? 'found' : 'empty',
      detail:
        results.length > 0
          ? 'Resultados diretos retornados pelo conector.'
          : fallbackLinks.length > 0
            ? 'API bloqueada ou vazia; fallback de pagina retornou links de anuncios.'
            : 'Sem resultados diretos e sem links validos no fallback de pagina.',
      count: results.length > 0 ? results.length : fallbackLinks.length,
    })
  }

  if (normalizedSources.includes('olx') || normalizedSources.includes('olxpro') || normalizedSources.includes('olx pro')) {
    const results = await searchOlxRss(modelo, tipo)
    const fallbackLinks = results.length === 0 ? await searchFallbackListingLinks('olx', modelo, tipo, 12) : []
    linkUrls.push(...results)
    linkUrls.push(...fallbackLinks)
    pushDiagnostic({
      source: 'olx',
      strategy: 'links',
      status: results.length > 0 || fallbackLinks.length > 0 ? 'found' : 'empty',
      detail:
        results.length > 0
          ? 'Links de anuncio coletados pela OLX.'
          : fallbackLinks.length > 0
            ? 'RSS bloqueado ou vazio; fallback de pagina retornou links de anuncios.'
            : 'Sem links validos da OLX nesta rodada.',
      count: results.length > 0 ? results.length : fallbackLinks.length,
    })
  }

  if (normalizedSources.includes('webmotors')) {
    const results = await searchWebmotors(modelo, tipo)
    linkUrls.push(...results)
    pushDiagnostic({
      source: 'webmotors',
      strategy: 'links',
      status: tipo === 'MOTO' ? 'ignored' : results.length > 0 ? 'found' : 'empty',
      detail:
        tipo === 'MOTO'
          ? 'Webmotors esta desativado para modo moto.'
          : results.length > 0
            ? 'Links de anuncio coletados pelo conector Webmotors.'
            : 'Sem links validos do Webmotors nesta rodada.',
      count: results.length,
    })
  }

  if (normalizedSources.includes('icarros')) {
    const results = await searchICarros(modelo, tipo)
    linkUrls.push(...results)
    pushDiagnostic({
      source: 'icarros',
      strategy: 'links',
      status: tipo === 'MOTO' ? 'ignored' : results.length > 0 ? 'found' : 'empty',
      detail:
        tipo === 'MOTO'
          ? 'iCarros esta desativado para modo moto.'
          : results.length > 0
            ? 'Links de anuncio coletados pelo conector iCarros.'
            : 'Sem links validos do iCarros nesta rodada.',
      count: results.length,
    })
  }

  if (normalizedSources.includes('kavak')) {
    const results = await searchKavak(modelo, tipo)
    linkUrls.push(...results)
    pushDiagnostic({
      source: 'kavak',
      strategy: 'links',
      status: tipo === 'MOTO' ? 'ignored' : results.length > 0 ? 'found' : 'empty',
      detail:
        tipo === 'MOTO'
          ? 'Kavak esta desativado para modo moto.'
          : results.length > 0
            ? 'Links de anuncio coletados pelo conector Kavak.'
            : 'Sem links validos do Kavak nesta rodada.',
      count: results.length,
    })
  }

  if (normalizedSources.includes('queroquero')) {
    pushDiagnostic({
      source: 'queroquero',
      strategy: 'links',
      status: 'ignored',
      detail: 'Quero-Quero ainda esta em automacao parcial e nao participa do scan automatico.',
      count: 0,
    })
  }

  if (normalizedSources.includes('facebook')) {
    console.log('[scan] facebook ignorado no scan automatico porque exige login.')
    pushDiagnostic({
      source: 'facebook',
      strategy: 'links',
      status: 'ignored',
      detail: 'Facebook exige login e segue fora do scan automatico.',
      count: 0,
    })
  }

  if (normalizedSources.includes('manual')) {
    pushDiagnostic({
      source: 'manual',
      strategy: 'links',
      status: 'ignored',
      detail: 'Fonte manual depende de URLs coladas em seedUrls.',
      count: 0,
    })
  }

  return {
    directResults: dedupeScanResults(directResults),
    linkUrls: Array.from(new Set(linkUrls)),
    sourceDiagnostics,
  }
}
