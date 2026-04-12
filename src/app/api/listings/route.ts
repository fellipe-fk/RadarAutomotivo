import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const minScore = searchParams.get('minScore')
    const maxRisk = searchParams.get('maxRisk')
    const maxDistance = searchParams.get('maxDistance')
    const maxPrice = searchParams.get('maxPrice')
    const source = searchParams.get('source')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {
      userId: user.id,
      isDiscarded: false,
    }

    if (type && type !== 'TODOS') where.type = type
    if (minScore) where.opportunityScore = { gte: parseInt(minScore, 10) }
    if (maxDistance) where.distanceKm = { lte: parseFloat(maxDistance) }
    if (maxPrice) where.price = { lte: parseFloat(maxPrice) }
    if (source && source !== 'TODOS') where.source = source.toLowerCase()
    if (status) where.status = status

    if (maxRisk === 'LOW') where.riskLevel = 'LOW'
    if (maxRisk === 'MEDIUM') where.riskLevel = { in: ['LOW', 'MEDIUM'] }

    const listings = await prisma.listing.findMany({
      where,
      orderBy: [{ opportunityScore: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ listings })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao buscar listagens:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = (await req.json()) as {
      id?: string
      isFavorite?: boolean
      isDiscarded?: boolean
    }

    if (!body.id) {
      return NextResponse.json({ error: 'Id da listagem e obrigatorio' }, { status: 400 })
    }

    const listing = await prisma.listing.findFirst({
      where: {
        id: body.id,
        userId: user.id,
      },
    })

    if (!listing) {
      return NextResponse.json({ error: 'Listagem nao encontrada' }, { status: 404 })
    }

    const updatedListing = await prisma.listing.update({
      where: { id: listing.id },
      data: {
        isFavorite: typeof body.isFavorite === 'boolean' ? body.isFavorite : listing.isFavorite,
        isDiscarded: typeof body.isDiscarded === 'boolean' ? body.isDiscarded : listing.isDiscarded,
      },
    })

    return NextResponse.json({ listing: updatedListing })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao atualizar listagem:', error)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
