import type { Listing, Prisma, VehicleType } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { NormalizedListing } from '../contracts/normalized-listing'

export type ListingUpsertOperation = 'created' | 'updated' | 'skipped'

export interface ListingUpsertResult {
  operation: ListingUpsertOperation
  listing?: Listing
  skippedReason?: string
  trashedListingId?: string
}

function mapVehicleType(type: NormalizedListing['vehicleType']): VehicleType {
  return type === 'MOTORCYCLE' ? 'MOTO' : 'CARRO'
}

function buildListingWriteData(listing: NormalizedListing): Omit<Prisma.ListingUncheckedCreateInput, 'userId'> {
  if (listing.price === null) {
    throw new Error('Normalized listing must have price before persistence.')
  }

  return {
    title: listing.title || 'Anuncio monitorado',
    description: listing.description || undefined,
    price: listing.price,
    type: mapVehicleType(listing.vehicleType),
    source: listing.source,
    sourceUrl: listing.canonicalUrl,
    imageUrls: listing.images,
    brand: listing.brand || undefined,
    model: listing.model || undefined,
    year: listing.year ?? undefined,
    mileage: listing.mileage ?? undefined,
    city: listing.city || undefined,
    state: listing.state || undefined,
    status: 'PENDING',
  }
}

export async function upsertNormalizedListing(userId: string, listing: NormalizedListing): Promise<ListingUpsertResult> {
  const existing = await prisma.listing.findFirst({
    where: {
      userId,
      sourceUrl: listing.canonicalUrl,
      deletedAt: null,
    },
  })

  const trashed = existing
    ? null
    : await prisma.listing.findFirst({
        where: {
          userId,
          sourceUrl: listing.canonicalUrl,
          deletedAt: { not: null },
        },
        select: {
          id: true,
          title: true,
        },
      })

  if (trashed) {
    return {
      operation: 'skipped',
      skippedReason: 'Anuncio ja esta na lixeira.',
      trashedListingId: trashed.id,
    }
  }

  const data = buildListingWriteData(listing)

  if (existing) {
    const updated = await prisma.listing.update({
      where: { id: existing.id },
      data,
    })

    return {
      operation: 'updated',
      listing: updated,
    }
  }

  const created = await prisma.listing.create({
    data: {
      userId,
      ...data,
    },
  })

  return {
    operation: 'created',
    listing: created,
  }
}
