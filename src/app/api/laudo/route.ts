import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

import { auditLog, requireAuth } from '@/lib/auth'
import { consultarLaudoVeicular, normalizarPlaca } from '@/lib/laudo'
import { prisma } from '@/lib/prisma'

const createLaudoSchema = z.object({
  plate: z.string().trim().min(7).max(8),
  renavam: z
    .string()
    .trim()
    .min(9)
    .max(20)
    .optional()
    .or(z.literal('')),
})

function normalizeOptional(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function canBypassLaudoCreditsForLocalDev(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  const hosts = [request.headers.get('host'), request.headers.get('x-forwarded-host')]
    .filter(Boolean)
    .map((value) => value!.toLowerCase())

  return hosts.some(
    (host) =>
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('localhost:') ||
      host.startsWith('127.0.0.1:')
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const items = await prisma.laudo.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        createdAt: true,
        placa: true,
        scoreCompra: true,
        situacao: true,
        resultado: true,
      },
    })

    return NextResponse.json({ items })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao buscar laudos:', error)
    return NextResponse.json({ error: 'Erro ao buscar laudos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const data = createLaudoSchema.parse(body)
    const allowDevCreditBypass = canBypassLaudoCreditsForLocalDev(request)

    const plate = normalizarPlaca(data.plate)

    if (plate.length !== 7) {
      return NextResponse.json({ error: 'Placa invalida' }, { status: 400 })
    }

    const renavam = normalizeOptional(data.renavam)
    const resultado = await consultarLaudoVeicular(plate, renavam)

    const transactionResult = await prisma.$transaction(async (tx) => {
      if (!allowDevCreditBypass) {
        const creditUpdate = await tx.user.updateMany({
          where: {
            id: user.id,
            creditosLaudo: { gt: 0 },
          },
          data: {
            creditosLaudo: { decrement: 1 },
          },
        })

        if (creditUpdate.count === 0) {
          throw new Error('SEM_CREDITOS')
        }
      }

      const laudo = await tx.laudo.create({
        data: {
          userId: user.id,
          placa: plate,
          renavam,
          resultado: resultado as Prisma.InputJsonValue,
          scoreCompra: resultado.score_compra,
          situacao: resultado.situacao_geral,
          valorCobrado: allowDevCreditBypass ? 0 : 19,
        },
        select: {
          id: true,
          createdAt: true,
          placa: true,
          scoreCompra: true,
          situacao: true,
          resultado: true,
        },
      })

      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { creditosLaudo: true },
      })

      return {
        laudo,
        creditBypass: allowDevCreditBypass,
        remainingCredits: updatedUser.creditosLaudo,
      }
    })

    await auditLog(user.id, 'laudo_generate', request, {
      placa: plate,
      scoreCompra: resultado.score_compra,
      situacao: resultado.situacao_geral,
      origem: resultado.origem,
    })

    return NextResponse.json(transactionResult, { status: 201 })
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

    if (error instanceof Error && error.message === 'SEM_CREDITOS') {
      return NextResponse.json(
        {
          error: 'Sem creditos de laudo disponiveis',
        },
        { status: 402 }
      )
    }

    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao gerar laudo:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar laudo' },
      { status: 500 }
    )
  }
}
