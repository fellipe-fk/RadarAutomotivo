import type { Listing, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export interface CreateListingSnapshotInput {
  listing: Listing
  scanRunId?: string | null
  rawPayload?: unknown
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
}

function safeRoundedInt(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(value)
}

function safeMarginPercent(listing: Listing) {
  if (typeof listing.estimatedMargin !== 'number' || !Number.isFinite(listing.estimatedMargin)) return null
  if (typeof listing.price !== 'number' || !Number.isFinite(listing.price) || listing.price <= 0) return null
  return Number(((listing.estimatedMargin / listing.price) * 100).toFixed(2))
}

export async function createListingSnapshot(input: CreateListingSnapshotInput) {
  const { listing, scanRunId, rawPayload } = input

  return prisma.listingSnapshot.create({
    data: {
      listingId: listing.id,
      scanRunId: scanRunId || undefined,
      price: safeRoundedInt(listing.price),
      title: listing.title,
      city: listing.city || undefined,
      state: listing.state || undefined,
      year: listing.year ?? undefined,
      mileage: listing.mileage ?? undefined,
      opportunityScore: listing.opportunityScore ?? undefined,
      riskScore: listing.riskScore ?? undefined,
      marginAmount: safeRoundedInt(listing.estimatedMargin),
      marginPercent: safeMarginPercent(listing),
      status: listing.status,
      rawPayload: rawPayload === undefined ? undefined : toJsonValue(rawPayload),
    },
  })
}
