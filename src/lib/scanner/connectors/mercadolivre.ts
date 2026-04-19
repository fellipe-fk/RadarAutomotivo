import type { ListingSeed } from '../contracts/listing-seed'
import type { ConnectorHealthCheckResult, ConnectorVehicleType, SearchParams, SourceConnector } from './types'

type MercadoLivreAttribute = {
  id: string
  value_name?: string | null
}

type MercadoLivreItem = {
  id: string
  title: string
  price: number
  permalink: string
  thumbnail?: string
  condition?: string
  date_created?: string
  seller?: {
    nickname?: string
  }
  seller_address?: {
    city?: { name?: string }
    state?: { abbreviation?: string }
  }
  attributes?: MercadoLivreAttribute[]
}

type MercadoLivreSearchResponse = {
  results?: MercadoLivreItem[]
}

const MERCADO_LIVRE_SOURCE = 'mercadolivre'

const MERCADO_LIVRE_CATEGORIES: Partial<Record<ConnectorVehicleType, string>> = {
  CAR: 'MLB1744',
  MOTORCYCLE: 'MLB1243',
}

function buildQuery(params: SearchParams) {
  const chunks = [params.query, params.brand, params.model]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  return chunks.join(' ').trim()
}

function parseNumericAttribute(attributes: MercadoLivreAttribute[] | undefined, id: string) {
  const rawValue = attributes?.find((entry) => entry.id === id)?.value_name
  if (!rawValue) return null

  const parsed = Number(rawValue.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseTextAttribute(attributes: MercadoLivreAttribute[] | undefined, id: string) {
  const rawValue = attributes?.find((entry) => entry.id === id)?.value_name?.trim()
  return rawValue || null
}

function normalizeImage(thumbnail?: string) {
  if (!thumbnail) return []
  return [thumbnail.replace('-I.jpg', '-O.jpg')]
}

function isWithinRange(value: number | null, min?: number, max?: number) {
  if (value === null) return true
  if (typeof min === 'number' && value < min) return false
  if (typeof max === 'number' && value > max) return false
  return true
}

function mapItemToSeed(item: MercadoLivreItem): ListingSeed {
  const year = parseNumericAttribute(item.attributes, 'VEHICLE_YEAR')
  const mileage = parseNumericAttribute(item.attributes, 'KILOMETERS')
  const brand = parseTextAttribute(item.attributes, 'BRAND')
  const model = parseTextAttribute(item.attributes, 'MODEL')
  const fuel = parseTextAttribute(item.attributes, 'FUEL_TYPE')
  const transmission = parseTextAttribute(item.attributes, 'TRANSMISSION')

  return {
    source: MERCADO_LIVRE_SOURCE,
    externalId: item.id,
    url: item.permalink,
    title: item.title,
    description: null,
    price: Number.isFinite(item.price) ? item.price : null,
    city: item.seller_address?.city?.name || null,
    state: item.seller_address?.state?.abbreviation || null,
    brand,
    model,
    year,
    mileage,
    fuel,
    transmission,
    images: normalizeImage(item.thumbnail),
    sellerName: item.seller?.nickname || null,
    sellerType: 'UNKNOWN',
    postedAt: item.date_created || null,
    rawPayload: item,
  }
}

async function runMercadoLivreSearch(params: SearchParams) {
  const query = buildQuery(params)
  if (!query) return []

  const url = new URL('https://api.mercadolibre.com/sites/MLB/search')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(Math.min(params.limit || 20, 50)))
  url.searchParams.set('condition', 'used')
  url.searchParams.set('sort', 'relevance')

  const categoryId = params.vehicleType ? MERCADO_LIVRE_CATEGORIES[params.vehicleType] : undefined
  if (categoryId) {
    url.searchParams.set('category', categoryId)
  }

  if (typeof params.minPrice === 'number' || typeof params.maxPrice === 'number') {
    const min = typeof params.minPrice === 'number' ? params.minPrice : '*'
    const max = typeof params.maxPrice === 'number' ? params.maxPrice : '*'
    url.searchParams.set('price', `${min}-${max}`)
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RadarAuto/1.0',
    },
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Mercado Livre search failed with status ${response.status}`)
  }

  const data = (await response.json()) as MercadoLivreSearchResponse

  return (data.results || [])
    .filter((item) => item.condition !== 'new')
    .map(mapItemToSeed)
    .filter((item) => (item.price ?? 0) >= 800)
    .filter((item) => isWithinRange(item.price ?? null, params.minPrice, params.maxPrice))
    .filter((item) => isWithinRange(item.year ?? null, params.minYear, params.maxYear))
    .filter((item) => isWithinRange(item.mileage ?? null, params.minMileage, params.maxMileage))
}

async function healthCheck(): Promise<ConnectorHealthCheckResult> {
  try {
    await runMercadoLivreSearch({ query: 'gol', vehicleType: 'CAR', limit: 1 })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      details: error instanceof Error ? error.message : 'Mercado Livre healthcheck failed',
    }
  }
}

export const mercadoLivreConnector: SourceConnector = {
  source: MERCADO_LIVRE_SOURCE,
  supportsDirectSearch: true,
  supportsAuthenticatedSearch: false,
  supportsManualExtraction: false,
  async search(params: SearchParams) {
    try {
      return await runMercadoLivreSearch(params)
    } catch (error) {
      console.warn(
        '[mercadolivre] API indisponivel para esta busca, o scan pode seguir via fallback de pagina:',
        error instanceof Error ? error.message : error
      )
      return []
    }
  },
  healthCheck,
}
