import type { ListingSeed } from '../contracts/listing-seed'
import type { ConnectorHealthCheckResult, ConnectorVehicleType, SearchParams, SourceConnector } from './types'

type OlxRssItem = {
  title: string
  link: string
  description: string
  pubDate: string | null
  imageUrl: string | null
}

const OLX_SOURCE = 'olx'

const OLX_FEEDS: Record<ConnectorVehicleType, string[]> = {
  CAR: ['https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/rss'],
  MOTORCYCLE: ['https://www.olx.com.br/autos-e-pecas/motos/rss'],
  UNKNOWN: [
    'https://www.olx.com.br/autos-e-pecas/motos/rss',
    'https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/rss',
  ],
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripHtml(value: string) {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, ' '))
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  }

function extractTagValue(block: string, tagName: string) {
  const regex = new RegExp(`<${tagName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'i')
  const match = block.match(regex)
  return match?.[1] ? decodeXmlEntities(match[1].trim()) : null
}

function extractImageUrl(description: string) {
  const match = description.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match?.[1] || null
}

function extractExternalId(url: string) {
  const match = url.match(/(\d{7,})/)
  return match?.[1] || null
}

function extractPrice(title: string, description: string) {
  const raw = `${title} ${stripHtml(description)}`
  const match = raw.match(/R\$\s*([\d\.\,]+)/i)
  if (!match?.[1]) return null

  const normalized = match[1].replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function extractLocation(description: string) {
  const plainText = stripHtml(description)
  const locationMatch = plainText.match(/([A-Za-zÀ-ÿ\s]+)\s*-\s*([A-Z]{2})/)

  if (!locationMatch) {
    return { city: null, state: null }
  }

  return {
    city: normalizeWhitespace(locationMatch[1]) || null,
    state: locationMatch[2] || null,
  }
}

function buildQueryTerms(params: SearchParams) {
  const query = [params.query, params.brand, params.model]
    .map((value) => value?.toLowerCase().trim())
    .filter((value): value is string => Boolean(value))
    .join(' ')

  return query
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
}

function matchesQuery(text: string, terms: string[]) {
  if (terms.length === 0) return true

  const normalizedText = text.toLowerCase()
  if (terms.length === 1) {
    return normalizedText.includes(terms[0])
  }

  const matchedTerms = terms.filter((part) => part.length > 2 && normalizedText.includes(part))
  return matchedTerms.length >= Math.min(2, terms.length)
}

function extractRssItems(xml: string) {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  const items: OlxRssItem[] = []
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = extractTagValue(block, 'title')
    const link = extractTagValue(block, 'link')
    const description = extractTagValue(block, 'description') || ''

    if (!title || !link) continue

    items.push({
      title: normalizeWhitespace(title),
      link: normalizeWhitespace(link),
      description,
      pubDate: extractTagValue(block, 'pubDate'),
      imageUrl: extractImageUrl(description),
    })
  }

  return items
}

function mapItemToSeed(item: OlxRssItem): ListingSeed {
  const location = extractLocation(item.description)

  return {
    source: OLX_SOURCE,
    externalId: extractExternalId(item.link),
    url: item.link,
    title: item.title,
    description: stripHtml(item.description) || null,
    price: extractPrice(item.title, item.description),
    city: location.city,
    state: location.state,
    brand: null,
    model: null,
    year: null,
    mileage: null,
    fuel: null,
    transmission: null,
    images: item.imageUrl ? [item.imageUrl] : [],
    sellerName: null,
    sellerType: 'UNKNOWN',
    postedAt: item.pubDate,
    rawPayload: item,
  }
}

async function fetchFeed(feedUrl: string) {
  const response = await fetch(feedUrl, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml',
      'User-Agent': 'Mozilla/5.0 (compatible; RadarAuto RSS reader)',
    },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`OLX feed failed with status ${response.status}`)
  }

  return response.text()
}

async function runOlxSearch(params: SearchParams) {
  const feeds = OLX_FEEDS[params.vehicleType || 'UNKNOWN']
  const terms = buildQueryTerms(params)
  const limit = Math.min(params.limit || 10, 50)
  const seeds: ListingSeed[] = []

  for (const feedUrl of feeds) {
    try {
      const xml = await fetchFeed(feedUrl)
      const items = extractRssItems(xml)

      for (const item of items) {
        if (!matchesQuery(`${item.title} ${item.description}`, terms)) {
          continue
        }

        seeds.push(mapItemToSeed(item))
      }
    } catch (error) {
      console.warn(
        `[olx] RSS indisponivel para ${feedUrl}, o scan pode seguir via fallback de pagina:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  const deduped = new Map<string, ListingSeed>()

  for (const seed of seeds) {
    deduped.set(seed.url, seed)
  }

  return Array.from(deduped.values()).slice(0, limit)
}

async function healthCheck(): Promise<ConnectorHealthCheckResult> {
  try {
    await runOlxSearch({ query: 'gol', vehicleType: 'CAR', limit: 1 })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      details: error instanceof Error ? error.message : 'OLX healthcheck failed',
    }
  }
}

export const olxConnector: SourceConnector = {
  source: OLX_SOURCE,
  supportsDirectSearch: true,
  supportsAuthenticatedSearch: false,
  supportsManualExtraction: false,
  async search(params: SearchParams) {
    return runOlxSearch(params)
  },
  healthCheck,
}
