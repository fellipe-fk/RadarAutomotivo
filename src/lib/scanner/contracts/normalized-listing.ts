import type { ListingSellerType, ListingSource } from './listing-seed'

export const NORMALIZED_VEHICLE_TYPES = ['CAR', 'MOTORCYCLE', 'UNKNOWN'] as const

export type NormalizedVehicleType = (typeof NORMALIZED_VEHICLE_TYPES)[number]

export interface NormalizedListing {
  source: ListingSource
  externalId: string | null
  canonicalUrl: string
  title: string | null
  description: string | null
  price: number | null
  city: string | null
  state: string | null
  brand: string | null
  model: string | null
  year: number | null
  mileage: number | null
  fuel: string | null
  transmission: string | null
  images: string[]
  sellerName: string | null
  sellerType: ListingSellerType
  postedAt: Date | null
  vehicleType: NormalizedVehicleType
  listingHash: string
  rawPayload: unknown
}
