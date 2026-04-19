import { createHash } from 'crypto'

import type { ListingSeed } from '../contracts/listing-seed'
import type { NormalizedListing, NormalizedVehicleType } from '../contracts/normalized-listing'

export interface NormalizeListingOptions {
  fallbackVehicleType?: NormalizedVehicleType
}

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mibextid',
  'mc_cid',
  'mc_eid',
  'ref',
  'spm',
  'src',
  'trk',
])

const MOTO_TOKENS = ['moto', 'xre', 'cg', 'biz', 'fazer', 'bros', 'hornet', 'pcx', 'nmax', 'cb', 'titan']
const CAR_TOKENS = ['carro', 'sedan', 'hatch', 'suv', 'pickup', 'corolla', 'civic', 'onix', 'gol', 'hb20', 'uno']

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeNullableText(value?: string | null) {
  if (!value) return null

  const normalized = normalizeWhitespace(value)
  return normalized || null
}

function normalizeImages(images: string[]) {
  const deduped = new Set<string>()

  for (const image of images) {
    const normalized = normalizeUrl(image)
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) continue
    deduped.add(normalized)
  }

  return Array.from(deduped)
}

function parseNumeric(value?: number | null, min?: number, max?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (typeof min === 'number' && value < min) return null
  if (typeof max === 'number' && value > max) return null
  return value
}

function parseInteger(value?: number | null, min?: number, max?: number) {
  const parsed = parseNumeric(value, min, max)
  return parsed === null ? null : Math.round(parsed)
}

function normalizeUrl(url: string) {
  const fallback = normalizeWhitespace(url)

  try {
    const parsed = new URL(fallback)

    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()

    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = ''
    }

    const params = Array.from(parsed.searchParams.keys())
    for (const key of params) {
      if (key.startsWith('utm_') || TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key)
      }
    }

    parsed.searchParams.sort()

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    }

    return parsed.toString()
  } catch {
    return fallback
  }
}

function normalizeLookupText(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferVehicleType(seed: ListingSeed, fallbackVehicleType: NormalizedVehicleType) {
  const hint = normalizeLookupText([seed.title, seed.description, seed.brand, seed.model].filter(Boolean).join(' '))

  if (MOTO_TOKENS.some((token) => hint.includes(token))) return 'MOTORCYCLE' as const
  if (CAR_TOKENS.some((token) => hint.includes(token))) return 'CAR' as const

  return fallbackVehicleType
}

function parsePostedAt(value?: string | null) {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function serializeHashInput(parts: Array<string | number | null>) {
  return parts.map((value) => (value === null ? '' : String(value))).join('|')
}

export function buildNormalizedListingContentSignature(listing: Pick<NormalizedListing, 'title' | 'price' | 'city' | 'state' | 'year' | 'mileage' | 'brand' | 'model'>) {
  return createHash('sha1')
    .update(
      serializeHashInput([
        normalizeLookupText(listing.title),
        listing.price === null ? null : Math.round(listing.price),
        normalizeLookupText(listing.city),
        normalizeLookupText(listing.state),
        listing.year,
        listing.mileage,
        normalizeLookupText(listing.brand),
        normalizeLookupText(listing.model),
      ])
    )
    .digest('hex')
}

function buildListingHash(listing: Omit<NormalizedListing, 'listingHash'>) {
  return createHash('sha1')
    .update(
      serializeHashInput([
        listing.source,
        listing.externalId,
        listing.canonicalUrl,
        normalizeLookupText(listing.title),
        listing.price === null ? null : Math.round(listing.price),
        normalizeLookupText(listing.city),
        normalizeLookupText(listing.state),
        listing.year,
        listing.mileage,
      ])
    )
    .digest('hex')
}

export function normalizeListingSeed(seed: ListingSeed, options: NormalizeListingOptions = {}): NormalizedListing {
  const fallbackVehicleType = options.fallbackVehicleType || 'UNKNOWN'
  const canonicalUrl = normalizeUrl(seed.url)
  const title = normalizeNullableText(seed.title)
  const description = normalizeNullableText(seed.description)
  const city = normalizeNullableText(seed.city)
  const state = normalizeNullableText(seed.state)
  const brand = normalizeNullableText(seed.brand)
  const model = normalizeNullableText(seed.model)
  const fuel = normalizeNullableText(seed.fuel)
  const transmission = normalizeNullableText(seed.transmission)
  const sellerName = normalizeNullableText(seed.sellerName)

  const baseListing: Omit<NormalizedListing, 'listingHash'> = {
    source: normalizeWhitespace(seed.source).toLowerCase(),
    externalId: normalizeNullableText(seed.externalId),
    canonicalUrl,
    title,
    description,
    price: parseNumeric(seed.price, 0),
    city,
    state,
    brand,
    model,
    year: parseInteger(seed.year, 1900, new Date().getFullYear() + 1),
    mileage: parseInteger(seed.mileage, 0, 2_000_000),
    fuel,
    transmission,
    images: normalizeImages(seed.images),
    sellerName,
    sellerType: seed.sellerType,
    postedAt: parsePostedAt(seed.postedAt),
    vehicleType: inferVehicleType(seed, fallbackVehicleType),
    rawPayload: seed.rawPayload ?? null,
  }

  return {
    ...baseListing,
    listingHash: buildListingHash(baseListing),
  }
}

export function normalizeListingSeeds(seeds: ListingSeed[], options: NormalizeListingOptions = {}) {
  return seeds.map((seed) => normalizeListingSeed(seed, options))
}
