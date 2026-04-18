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
  restore: z.boolean().optional(),
})

function normalizeOptional(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function buildStats(items: Array<{ status: CrmStatus; precoCompra: number | null; precoVenda: number | null }>) {
  const invested = items
    .filter((item) => item.status === CrmStatus.COMPRADO || item.status === CrmStatus.REVENDIDO)
    .reduce((total, item) => total + (item.precoCompra || 0), 0)

  const sold = items
    .filter((item) => item.status === CrmStatus.REVENDIDO)
    .reduce((total, item) => total + (item.precoVenda || Math.round((item.precoCompra || 0) * 1.12)), 0)

  const soldCost = items
    .filter((item) => item.status === CrmStatus.REVENDIDO)
    .reduce((total, item) => total + (item.precoCompra || 0), 0)

  const profit = sold - soldCost

  return {
    total: items.length,
    interesse: items.filter((item) => item.status === CrmStatus.INTERESSE).length,
    negociando: items.filter((item) => item.status === CrmStatus.NEGOCIANDO).length,
    comprado: items.filter((item) => item.status === CrmStatus.COMPRADO).length,
    revendidos: items.filter((item) => item.status === CrmStatus.REVENDIDO).length,
    falhas: items.filter((item) => item.status === CrmStatus.FALHA_NEGOCIACAO).length,
    invested,
    sold,
    profit,
  }
}

async function updateItem(request: NextRequest) {
  const user = await requireAuth(request)
  const body = await request.json()
  const data = updateCrmItemSchema.parse(body)

  const item = await prisma.crmItem.findFirst({
    where: {
      id: data.id,
      userId: user.id,
      ...(data.restore ? {} : { deletedAt: null }),
    },
  })

  if (!item) {
    return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })
  }

  if (data.restore) {
    const restored = await prisma.crmItem.update({
      where: { id: item.id },
      data: { deletedAt: null },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            sourceUrl: true,
            deletedAt: true,
          },
        },
      },
    })

    return NextResponse.json({ item: restored })
  }

  if (data.listingId) {
    const listing = await prisma.listing.findFirst({
      where: {
        id: data.listingId,
        userId: user.id,
        deletedAt: null,
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
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const trashView = request.nextUrl.searchParams.get('view') === 'trash'

    const items = await prisma.crmItem.findMany({
      where: {
        userId: user.id,
        deletedAt: trashView ? { not: null } : null,
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            sourceUrl: true,
            deletedAt: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    })

    const stats = buildStats(items)

    return NextResponse.json({
      items,
      stats,
      financial: {
        investido: stats.invested,
        revendido: stats.sold,
        lucro: stats.profit,
        negociando: stats.negociando,
        totalItens: stats.total,
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
          deletedAt: null,
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
      return NextResponse.json({ error: 'Dados invalidos', details: error.flatten() }, { status: 400 })
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
    return await updateItem(request)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Dados invalidos', details: error.flatten() }, { status: 400 })
    }

    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao atualizar CRM:', error)
    return NextResponse.json({ error: 'Erro ao atualizar CRM' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  return PATCH(request)
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const { id } = (await request.json()) as { id?: string }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })
    }

    const item = await prisma.crmItem.findFirst({
      where: {
        id,
        userId: user.id,
        deletedAt: null,
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })
    }

    await prisma.crmItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return NextResponse.json({ ok: true, trashed: true })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao remover item do CRM:', error)
    return NextResponse.json({ error: 'Erro ao remover item do CRM' }, { status: 500 })
  }
}
