import type { NormalizedListing } from '../contracts/normalized-listing'
import { buildNormalizedListingContentSignature } from './normalize'

export type ListingDuplicateReason = 'source-external-id' | 'canonical-url' | 'content-signature' | 'market-fingerprint'

export interface DuplicateListingMatch {
  listing: NormalizedListing
  matchedWith: NormalizedListing
  reason: ListingDuplicateReason
}

export interface DedupeNormalizedListingsResult {
  uniqueListings: NormalizedListing[]
  duplicates: DuplicateListingMatch[]
}

const MARKET_STOPWORDS = new Set([
  'com',
  'de',
  'do',
  'da',
  'e',
  'em',
  'para',
  'vendo',
  'venda',
  'carro',
  'moto',
  'motocicleta',
  'veiculo',
  'seminovo',
  'usado',
  'flex',
  'automatico',
  'manual',
  'completo',
  'top',
  'abaixo',
  'tabela',
])

function buildSourceExternalIdKey(listing: NormalizedListing) {
  if (!listing.externalId) return null
  return `${listing.source}:${listing.externalId}`
}

function buildCanonicalUrlKey(listing: NormalizedListing) {
  return listing.canonicalUrl || null
}

function buildContentSignatureKey(listing: NormalizedListing) {
  return buildNormalizedListingContentSignature(listing)
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

function buildTitleFingerprint(title?: string | null) {
  const tokens = normalizeLookupText(title)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !MARKET_STOPWORDS.has(token))

  return tokens.slice(0, 6).join(' ')
}

function roundBucket(value: number | null, size: number) {
  if (value === null || !Number.isFinite(value)) return null
  return Math.round(value / size) * size
}

function buildMarketFingerprintKey(listing: NormalizedListing) {
  const titleFingerprint = buildTitleFingerprint([listing.brand, listing.model, listing.title].filter(Boolean).join(' '))
  if (!titleFingerprint) return null

  return [
    titleFingerprint,
    normalizeLookupText(listing.city),
    normalizeLookupText(listing.state),
    listing.year,
    roundBucket(listing.price, 1000),
    roundBucket(listing.mileage, 10000),
  ].join('|')
}

export function dedupeNormalizedListings(listings: NormalizedListing[]): DedupeNormalizedListingsResult {
  const uniqueListings: NormalizedListing[] = []
  const duplicates: DuplicateListingMatch[] = []

  const byExternalId = new Map<string, NormalizedListing>()
  const byCanonicalUrl = new Map<string, NormalizedListing>()
  const byContentSignature = new Map<string, NormalizedListing>()
  const byMarketFingerprint = new Map<string, NormalizedListing>()

  for (const listing of listings) {
    const externalIdKey = buildSourceExternalIdKey(listing)
    if (externalIdKey) {
      const matched = byExternalId.get(externalIdKey)
      if (matched) {
        duplicates.push({ listing, matchedWith: matched, reason: 'source-external-id' })
        continue
      }
    }

    const canonicalUrlKey = buildCanonicalUrlKey(listing)
    if (canonicalUrlKey) {
      const matched = byCanonicalUrl.get(canonicalUrlKey)
      if (matched) {
        duplicates.push({ listing, matchedWith: matched, reason: 'canonical-url' })
        continue
      }
    }

    const contentSignatureKey = buildContentSignatureKey(listing)
    const matchedByContent = byContentSignature.get(contentSignatureKey)
    if (matchedByContent) {
      duplicates.push({ listing, matchedWith: matchedByContent, reason: 'content-signature' })
      continue
    }

    const marketFingerprintKey = buildMarketFingerprintKey(listing)
    if (marketFingerprintKey) {
      const matchedByMarketFingerprint = byMarketFingerprint.get(marketFingerprintKey)
      if (matchedByMarketFingerprint) {
        duplicates.push({ listing, matchedWith: matchedByMarketFingerprint, reason: 'market-fingerprint' })
        continue
      }
    }

    uniqueListings.push(listing)

    if (externalIdKey) {
      byExternalId.set(externalIdKey, listing)
    }

    if (canonicalUrlKey) {
      byCanonicalUrl.set(canonicalUrlKey, listing)
    }

    byContentSignature.set(contentSignatureKey, listing)

    if (marketFingerprintKey) {
      byMarketFingerprint.set(marketFingerprintKey, listing)
    }
  }

  return {
    uniqueListings,
    duplicates,
  }
}
