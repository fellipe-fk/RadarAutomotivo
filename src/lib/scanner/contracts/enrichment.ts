export interface ListingEnrichment {
  normalizedTitle?: string | null
  normalizedDescription?: string | null
  inferredBrand?: string | null
  inferredModel?: string | null
  inferredYear?: number | null
  inferredMileage?: number | null
  marketReferencePrice?: number | null
  estimatedResalePrice?: number | null
  estimatedRepairCost?: number | null
  extractedSignals: string[]
  warnings: string[]
}
