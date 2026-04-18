import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { cancelAbacateSubscription, createAbacateCustomer, createSubscriptionCheckout, isAbacatePayConfigured } from '@/lib/abacatepay'
import { auditLog, requireAuth } from '@/lib/auth'
import { ACTIVE_PLAN_KEY } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { getBillingStatusTone, inferSubscriptionState, normalizeBillingStatus } from '@/lib/subscription-state'

const checkoutSchema = z.object({
  plan: z.literal(ACTIVE_PLAN_KEY),
})

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function serializeHistoryItem(item: {
  id: string
  createdAt: Date
  valor: number
  descricao: string
  status: string
  tipo: string
  externalReferenceId?: string | null
  billingEvent?: string | null
  abacatepayId?: string | null
  abacatepayPaymentId?: string | null
}) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    valor: item.valor,
    descricao: item.descricao,
    status: item.status,
    normalizedStatus: normalizeBillingStatus(item.status),
    tone: getBillingStatusTone(item.status),
    tipo: item.tipo,
    externalReferenceId: item.externalReferenceId,
    billingEvent: item.billingEvent,
    isLinkedToAbacatePay: Boolean(item.abacatepayId || item.abacatepayPaymentId),
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const [fullUser, payments] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          plano: true,
          assinaturaStatus: true,
          trialEndsAt: true,
          assinaturaEndsAt: true,
          abacatepayCustomerId: true,
          abacatepaySubscriptionId: true,
        },
      }),
      prisma.pagamento.findMany({
        where: {
          userId: user.id,
          tipo: 'ASSINATURA',
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ])

    const billingState = inferSubscriptionState(fullUser, payments)

    return NextResponse.json({
      subscription: {
        plano: fullUser.plano,
        assinaturaStatus: billingState.effectiveStatus,
        persistedStatus: fullUser.assinaturaStatus,
        trialEndsAt: fullUser.trialEndsAt,
        assinaturaEndsAt: fullUser.assinaturaEndsAt,
        abacatepayCustomerId: fullUser.abacatepayCustomerId,
        abacatepaySubscriptionId: fullUser.abacatepaySubscriptionId,
        checkoutRequired: billingState.checkoutRequired,
        hasConfirmedBilling: billingState.hasConfirmedBilling,
        hasPendingCheckout: billingState.hasPendingCheckout,
        hasBillingProfile: billingState.hasBillingProfile,
        latestBillingStatus: billingState.latestLinkedPaymentStatus,
        latestBillingAt: billingState.latestLinkedPaymentAt,
        canCancel: billingState.canCancel,
        canCreateCheckout: billingState.canCreateCheckout,
      },
      billingConfigured: isAbacatePayConfigured(),
      history: payments.map(serializeHistoryItem),
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao carregar assinatura:', error)
    return NextResponse.json({ error: 'Erro ao carregar assinatura' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request)
    const body = await request.json()
    const { plan } = checkoutSchema.parse(body)

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        zipCode: true,
        abacatepayCustomerId: true,
        plano: true,
        assinaturaStatus: true,
        trialEndsAt: true,
        assinaturaEndsAt: true,
        abacatepaySubscriptionId: true,
        pagamentos: {
          where: { tipo: 'ASSINATURA' },
          orderBy: { createdAt: 'desc' },
          take: 12,
          select: {
            status: true,
            createdAt: true,
            abacatepayId: true,
            abacatepayPaymentId: true,
          },
        },
      },
    })

    const billingState = inferSubscriptionState(user, user.pagamentos)

    if (!billingState.canCreateCheckout) {
      if (user.plano === plan) {
        return NextResponse.json({ error: 'Este plano ja esta ativo na sua conta.' }, { status: 409 })
      }

      return NextResponse.json({ error: 'Ja existe uma assinatura ativa vinculada a sua conta.' }, { status: 409 })
    }

    let customerId = user.abacatepayCustomerId
    if (!customerId) {
      const customer = await createAbacateCustomer({
        email: user.email,
        name: user.name,
        cellphone: user.phone || undefined,
        zipCode: user.zipCode || undefined,
      })

      if (!customer?.id) {
        throw new Error('Nao foi possivel criar o cliente na AbacatePay.')
      }

      customerId = customer.id

      await prisma.user.update({
        where: { id: user.id },
        data: { abacatepayCustomerId: customerId },
      })
    }

    const { checkout, externalId } = await createSubscriptionCheckout({
      plan,
      customerId,
      userId: user.id,
      email: user.email,
      appUrl: request.nextUrl.origin,
    })

    await prisma.pagamento.create({
      data: {
        userId: user.id,
        valor: checkout.amount / 100,
        descricao: `Assinatura ${plan} | ref ${externalId}`,
        status: checkout.status,
        tipo: 'ASSINATURA',
        externalReferenceId: externalId,
        billingEvent: 'subscription.checkout_created',
        abacatepayId: checkout.id,
      },
    })

    await auditLog(user.id, 'subscription.checkout_created', request, {
      plan,
      checkoutId: checkout.id,
      externalId,
    })

    return NextResponse.json({
      checkoutUrl: checkout.url,
      checkoutId: checkout.id,
      externalId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Plano invalido', details: error.flatten() }, { status: 400 })
    }

    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    if (error instanceof Error && /version mismatch/i.test(error.message)) {
      return NextResponse.json(
        { error: 'A chave atual da AbacatePay nao e compativel com a API v2. Gere uma chave v2 antes de criar o checkout.' },
        { status: 400 }
      )
    }

    console.error('Erro ao criar checkout de assinatura:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar checkout de assinatura' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await requireAuth(request)
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      select: {
        id: true,
        plano: true,
        abacatepaySubscriptionId: true,
        assinaturaStatus: true,
      },
    })

    if (!user.abacatepaySubscriptionId) {
      return NextResponse.json(
        { error: 'Sua assinatura ainda nao foi sincronizada com a AbacatePay. Tente novamente quando o webhook confirmar a assinatura.' },
        { status: 409 }
      )
    }

    await cancelAbacateSubscription(user.abacatepaySubscriptionId)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        assinaturaStatus: 'CANCELADA',
        assinaturaEndsAt: new Date(),
      },
    })

    await auditLog(user.id, 'subscription.cancel_requested', request, {
      plano: user.plano,
      subscriptionId: user.abacatepaySubscriptionId,
    })

    return NextResponse.json({
      ok: true,
      status: 'CANCELADA',
      message: 'Assinatura cancelada com sucesso. Nenhuma nova cobranca sera gerada.',
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao cancelar assinatura:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao cancelar assinatura' },
      { status: 500 }
    )
  }
}
