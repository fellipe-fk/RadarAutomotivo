import { CrmStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const crmStatusSchema = z.nativeEnum(CrmStatus)

const createCrmItemSchema = z.object({
  title: z.string().trim().min(2).max(120),
  precoCompra: z.coerce.number().min(0).optional(),
  precoVenda: z.coerce.number().min(0).optional(),
  status: crmStatusSchema.optional().default(CrmStatus.INTERESSE),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  listingId: z.string().trim().optional().or(z.literal('')),
  plate: z.string().trim().max(12).optional().or(z.literal('')),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  mileage: z.coerce.number().int().min(0).max(1000000).optional(),
})

const updateCrmItemSchema = createCrmItemSchema.partial().extend({
  id: z.string().trim().min(1),
})

function normalizeOptional(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const items = await prisma.crmItem.findMany({
      where: { userId: user.id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            sourceUrl: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    })

    const invested = items
      .filter((item) => item.status === CrmStatus.COMPRADO || item.status === CrmStatus.REVENDIDO)
      .reduce((total, item) => total + (item.precoCompra || 0), 0)

    const sold = items
      .filter((item) => item.status === CrmStatus.REVENDIDO)
      .reduce((total, item) => total + (item.precoVenda || Math.round((item.precoCompra || 0) * 1.12)), 0)

    const soldCost = items
      .filter((item) => item.status === CrmStatus.REVENDIDO)
      .reduce((total, item) => total + (item.precoCompra || 0), 0)

    return NextResponse.json({
      items,
      stats: {
        total: items.length,
        interesse: items.filter((item) => item.status === CrmStatus.INTERESSE).length,
        negociando: items.filter((item) => item.status === CrmStatus.NEGOCIANDO).length,
        comprado: items.filter((item) => item.status === CrmStatus.COMPRADO).length,
        revendidos: items.filter((item) => item.status === CrmStatus.REVENDIDO).length,
        invested,
        sold,
        profit: sold - soldCost,
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao buscar CRM:', error)
    return NextResponse.json({ error: 'Erro ao buscar CRM' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const data = createCrmItemSchema.parse(body)

    if (data.listingId) {
      const listing = await prisma.listing.findFirst({
        where: {
          id: data.listingId,
          userId: user.id,
        },
      })

      if (!listing) {
        return NextResponse.json({ error: 'Listagem nao encontrada' }, { status: 404 })
      }
    }

    const item = await prisma.crmItem.create({
      data: {
        userId: user.id,
        listingId: normalizeOptional(data.listingId),
        title: data.title,
        precoCompra: data.precoCompra,
        precoVenda: data.precoVenda,
        status: data.status,
        notes: normalizeOptional(data.notes),
        plate: normalizeOptional(data.plate),
        year: data.year,
        mileage: data.mileage,
        photos: [],
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            sourceUrl: true,
          },
        },
      },
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Dados invalidos',
          details: error.flatten(),
        },
        { status: 400 }
      )
    }

    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao criar item no CRM:', error)
    return NextResponse.json({ error: 'Erro ao criar item no CRM' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const data = updateCrmItemSchema.parse(body)

    const item = await prisma.crmItem.findFirst({
      where: {
        id: data.id,
        userId: user.id,
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })
    }

    if (data.listingId) {
      const listing = await prisma.listing.findFirst({
        where: {
          id: data.listingId,
          userId: user.id,
        },
      })

      if (!listing) {
        return NextResponse.json({ error: 'Listagem nao encontrada' }, { status: 404 })
      }
    }

    const updatedItem = await prisma.crmItem.update({
      where: { id: item.id },
      data: {
        listingId: data.listingId !== undefined ? normalizeOptional(data.listingId) : undefined,
        title: data.title,
        precoCompra: data.precoCompra,
        precoVenda: data.precoVenda,
        status: data.status,
        notes: data.notes !== undefined ? normalizeOptional(data.notes) : undefined,
        plate: data.plate !== undefined ? normalizeOptional(data.plate) : undefined,
        year: data.year,
        mileage: data.mileage,
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            sourceUrl: true,
          },
        },
      },
    })

    return NextResponse.json({ item: updatedItem })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Dados invalidos',
          details: error.flatten(),
        },
        { status: 400 }
      )
    }

    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao atualizar CRM:', error)
    return NextResponse.json({ error: 'Erro ao atualizar CRM' }, { status: 500 })
  }
}
