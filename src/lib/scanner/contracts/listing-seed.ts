export const LISTING_SELLER_TYPES = ['PRIVATE', 'DEALER', 'UNKNOWN'] as const

export type ListingSellerType = (typeof LISTING_SELLER_TYPES)[number]

export type ListingSource = string

export interface ListingSeed {
  source: ListingSource
  externalId?: string | null
  url: string
  title?: string | null
  description?: string | null
  price?: number | null
  city?: string | null
  state?: string | null
  brand?: string | null
  model?: string | null
  year?: number | null
  mileage?: number | null
  fuel?: string | null
  transmission?: string | null
  images: string[]
  sellerName?: string | null
  sellerType: ListingSellerType
  postedAt?: string | null
  rawPayload?: unknown
}
