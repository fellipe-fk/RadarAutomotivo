import type { ListingSeed } from '../contracts/listing-seed'
import type { ConnectorHealthCheckResult, SearchParams, SourceConnector } from './types'

const WEBMOTORS_SOURCE = 'webmotors'

function buildQuery(params: SearchParams) {
  const chunks = [params.query, params.brand, params.model]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  return chunks.join(' ').trim()
}

function normalizeUrl(candidateUrl: string) {
  try {
    const parsed = new URL(candidateUrl)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return candidateUrl.trim()
  }
}

function decodeEscapedContent(value: string) {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
}

function extractCandidateUrls(content: string) {
  const normalizedContent = decodeEscapedContent(content)
  const candidates = new Set<string>()

  const absoluteMatches = normalizedContent.match(/https?:\/\/[^\s"'<>\\]+/g) || []
  for (const match of absoluteMatches) {
    candidates.add(normalizeUrl(match))
  }

  const relativeMatches = normalizedContent.match(/\/comprar\/[^\s"'<>\\]+/g) || []
  for (const match of relativeMatches) {
    candidates.add(normalizeUrl(`https://www.webmotors.com.br${match}`))
  }

  return Array.from(candidates).filter((url) => {
    try {
      const parsed = new URL(url)
      const path = parsed.pathname.toLowerCase()
      return parsed.hostname.includes('webmotors.com.br') && (path.includes('/comprar/') || path.includes('/detalhes/'))
    } catch {
      return false
    }
  })
}

function titleFromUrl(url: string) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    const listingSlug = parts.slice(2, 6).join(' ')
    return listingSlug
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return null
  }
}

async function fetchSearchDocument(searchUrl: string) {
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
    throw new Error(`Webmotors search failed with status ${fallbackResponse.status}`)
  }

  return fallbackResponse.text()
}

async function runWebmotorsSearch(params: SearchParams) {
  const query = buildQuery(params)
  if (!query) return []
  if (params.vehicleType === 'MOTORCYCLE') return []

  const searchUrl = `https://www.webmotors.com.br/carros/estoque?busca=${encodeURIComponent(query)}`
  const content = await fetchSearchDocument(searchUrl)
  const limit = Math.min(params.limit || 12, 30)

  return extractCandidateUrls(content)
    .slice(0, limit)
    .map<ListingSeed>((url) => ({
      source: WEBMOTORS_SOURCE,
      externalId: null,
      url,
      title: titleFromUrl(url),
      description: null,
      price: null,
      city: null,
      state: null,
      brand: null,
      model: null,
      year: null,
      mileage: null,
      fuel: null,
      transmission: null,
      images: [],
      sellerName: null,
      sellerType: 'UNKNOWN',
      postedAt: null,
      rawPayload: {
        searchUrl,
      },
    }))
}

async function healthCheck(): Promise<ConnectorHealthCheckResult> {
  try {
    await runWebmotorsSearch({ query: 'gol', vehicleType: 'CAR', limit: 1 })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      details: error instanceof Error ? error.message : 'Webmotors healthcheck failed',
    }
  }
}

export const webmotorsConnector: SourceConnector = {
  source: WEBMOTORS_SOURCE,
  supportsDirectSearch: true,
  supportsAuthenticatedSearch: false,
  supportsManualExtraction: true,
  async search(params: SearchParams) {
    try {
      return await runWebmotorsSearch(params)
    } catch (error) {
      console.warn('[webmotors] busca indisponivel, sem resultados nesta rodada:', error instanceof Error ? error.message : error)
      return []
    }
  },
  healthCheck,
}
