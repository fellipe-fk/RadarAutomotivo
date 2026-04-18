import { NextRequest, NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

import { auditLog, requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { inferSubscriptionState } from '@/lib/subscription-state'

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  state: z.string().trim().length(2).optional().or(z.literal('')),
  raioKm: z.coerce.number().int().min(1).max(1000).optional(),
  consumoKmL: z.coerce.number().min(1).max(50).optional(),
  emailAlertas: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  silencioNoturno: z.boolean().optional(),
  margemMinima: z.coerce.number().int().min(0).max(100000).optional(),
  focoTipo: z.enum(['TODOS', 'MOTO', 'CARRO']).optional(),
  telegramChatId: z.string().trim().max(100).optional().or(z.literal('')),
})

function normalizeOptionalToNull(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function mapUserResponse(user: {
  id: string
  name: string
  email: string
  phone: string | null
  city: string | null
  state: string | null
  plano: string
  assinaturaStatus: string
  trialEndsAt: Date | null
  creditosLaudo: number
  raioKm: number
  consumoKmL: number
  emailAlertas: boolean
  whatsappEnabled: boolean
  telegramEnabled: boolean
  silencioNoturno: boolean
  margemMinima: number
  focoTipo: string
  telegramChatId: string | null
  abacatepayCustomerId?: string | null
  abacatepaySubscriptionId?: string | null
}, billingState?: {
  effectiveStatus: string
  checkoutRequired: boolean
  hasConfirmedBilling: boolean
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    state: user.state,
    plano: user.plano,
    assinaturaStatus: billingState?.effectiveStatus || user.assinaturaStatus,
    persistedAssinaturaStatus: user.assinaturaStatus,
    trialEndsAt: user.trialEndsAt,
    checkoutRequired: billingState?.checkoutRequired || false,
    hasConfirmedBilling: billingState?.hasConfirmedBilling || false,
    creditosLaudo: user.creditosLaudo,
    raioKm: user.raioKm,
    consumoKmL: user.consumoKmL,
    emailAlertas: user.emailAlertas,
    whatsappEnabled: user.whatsappEnabled,
    telegramEnabled: user.telegramEnabled,
    silencioNoturno: user.silencioNoturno,
    margemMinima: user.margemMinima,
    focoTipo: user.focoTipo,
    telegramChatId: user.telegramChatId,
  }
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request)
    const [user, payments] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: authUser.id },
      }),
      prisma.pagamento.findMany({
        where: {
          userId: authUser.id,
          tipo: 'ASSINATURA',
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ])

    const billingState = inferSubscriptionState(user, payments)

    return NextResponse.json({ user: mapUserResponse(user, billingState) })
  } catch {
    return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authUser = await requireAuth(request)
    const body = await request.json()
    const data = updateUserSchema.parse(body)

    const user = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        name: data.name,
        phone: normalizeOptionalToNull(data.phone),
        city: normalizeOptionalToNull(data.city),
        state: data.state?.trim() ? data.state.trim().toUpperCase() : null,
        raioKm: data.raioKm,
        consumoKmL: data.consumoKmL,
        emailAlertas: data.emailAlertas,
        whatsappEnabled: data.whatsappEnabled,
        telegramEnabled: data.telegramEnabled,
        silencioNoturno: data.silencioNoturno,
        margemMinima: data.margemMinima,
        focoTipo: data.focoTipo,
        telegramChatId: normalizeOptionalToNull(data.telegramChatId),
      },
    })

    await auditLog(authUser.id, 'profile_update', request)

    return NextResponse.json({ user: mapUserResponse(user) })
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

    console.error('Erro ao atualizar usuario:', error)
    return NextResponse.json({ error: 'Erro ao atualizar usuario' }, { status: 500 })
  }
}
