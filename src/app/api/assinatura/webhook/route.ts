import { NextRequest, NextResponse } from 'next/server'

import { ACTIVE_PLAN_KEY, type PlanKey } from '@/lib/plans'
import { verifyAbacateWebhookSignature } from '@/lib/abacatepay'
import { prisma } from '@/lib/prisma'

type WebhookPayload = {
  id?: string
  event?: string
  apiVersion?: number
  devMode?: boolean
  data?: {
    id?: string
    externalId?: string
    amount?: number
    paidAmount?: number
    status?: string
    frequency?: 'MONTHLY' | 'ANNUALLY' | 'WEEKLY' | 'SEMIANNUALLY'
    metadata?: Record<string, unknown>
    subscription?: {
      id?: string
      externalId?: string
      status?: string
      frequency?: 'MONTHLY' | 'ANNUALLY' | 'WEEKLY' | 'SEMIANNUALLY'
      metadata?: Record<string, unknown>
    }
    payment?: {
      id?: string
      externalId?: string
      amount?: number
      status?: string
    }
    checkout?: {
      id?: string
      externalId?: string
      amount?: number
      status?: string
    }
    customer?: {
      id?: string
      email?: string
    } | null
  }
}

function getLegacyData(payload: WebhookPayload) {
  return payload.data || {}
}

function getCustomerData(payload: WebhookPayload) {
  return payload.data?.customer || null
}

function getMetadata(payload: WebhookPayload) {
  return payload.data?.subscription?.metadata || getLegacyData(payload).metadata || {}
}

function getExternalId(payload: WebhookPayload) {
  return (
    payload.data?.payment?.externalId ||
    payload.data?.checkout?.externalId ||
    payload.data?.subscription?.externalId ||
    getLegacyData(payload).externalId ||
    ''
  )
}

function getEventId(payload: WebhookPayload) {
  return payload.data?.payment?.id || payload.data?.checkout?.id || payload.data?.subscription?.id || getLegacyData(payload).id || payload.id || ''
}

function getCheckoutId(payload: WebhookPayload) {
  return payload.data?.checkout?.id || ''
}

function getPaymentId(payload: WebhookPayload) {
  return payload.data?.payment?.id || ''
}

function getAmount(payload: WebhookPayload) {
  return payload.data?.payment?.amount || payload.data?.checkout?.amount || getLegacyData(payload).amount || getLegacyData(payload).paidAmount || 0
}

function getFrequency(payload: WebhookPayload) {
  return payload.data?.subscription?.frequency || getLegacyData(payload).frequency
}

function getSecretFromRequest(request: NextRequest) {
  return request.nextUrl.searchParams.get('webhookSecret') || ''
}

function addCycle(date: Date, frequency?: string) {
  const next = new Date(date)

  switch (frequency) {
    case 'ANNUALLY':
      next.setFullYear(next.getFullYear() + 1)
      break
    case 'SEMIANNUALLY':
      next.setMonth(next.getMonth() + 6)
      break
    case 'WEEKLY':
      next.setDate(next.getDate() + 7)
      break
    default:
      next.setMonth(next.getMonth() + 1)
      break
  }

  return next
}

function resolvePlan(payload: WebhookPayload): PlanKey | null {
  const metadataPlan = getMetadata(payload).plan || payload.data?.checkout?.externalId || payload.data?.payment?.externalId || getLegacyData(payload).externalId
  return String(metadataPlan || '').toUpperCase().includes(ACTIVE_PLAN_KEY) ? ACTIVE_PLAN_KEY : ACTIVE_PLAN_KEY
}

async function resolveUser(payload: WebhookPayload) {
  const metadataUserId = getMetadata(payload).userId

  if (typeof metadataUserId === 'string' && metadataUserId) {
    return prisma.user.findUnique({ where: { id: metadataUserId } })
  }

  const customerId = getCustomerData(payload)?.id
  if (customerId) {
    const user = await prisma.user.findFirst({
      where: { abacatepayCustomerId: customerId },
    })
    if (user) return user
  }

  const email = getCustomerData(payload)?.email
  if (email) {
    return prisma.user.findUnique({ where: { email } })
  }

  return null
}

async function updatePaymentRecord(userId: string, payload: WebhookPayload, status: string, event: string) {
  const externalId = getExternalId(payload)
  const eventId = getEventId(payload)
  const paymentId = getPaymentId(payload)
  const checkoutId = getCheckoutId(payload)
  const amount = getAmount(payload)

  const orFilters = [
    paymentId ? { abacatepayPaymentId: paymentId } : null,
    checkoutId ? { abacatepayId: checkoutId } : null,
    externalId ? { descricao: { contains: externalId } } : null,
    eventId ? { abacatepayPaymentId: eventId } : null,
  ].filter(Boolean) as Array<Record<string, unknown>>

  const existing = orFilters.length
    ? await prisma.pagamento.findFirst({
        where: {
          userId,
          tipo: 'ASSINATURA',
          OR: orFilters,
        },
        orderBy: { createdAt: 'desc' },
      })
    : null

  if (existing) {
    await prisma.pagamento.update({
      where: { id: existing.id },
      data: {
        status,
        valor: amount > 0 ? amount / 100 : existing.valor,
        externalReferenceId: externalId || existing.externalReferenceId,
        billingEvent: event,
        abacatepayId: checkoutId || existing.abacatepayId,
        abacatepayPaymentId: paymentId || eventId || existing.abacatepayPaymentId,
      },
    })
    return
  }

  await prisma.pagamento.create({
    data: {
      userId,
      valor: amount > 0 ? amount / 100 : 0,
      descricao: `Webhook assinatura${externalId ? ` | ref ${externalId}` : ''}`,
      status,
      tipo: 'ASSINATURA',
      externalReferenceId: externalId || null,
      billingEvent: event,
      abacatepayId: checkoutId || null,
      abacatepayPaymentId: paymentId || eventId || null,
    },
  })
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.ABACATEPAY_WEBHOOK_SECRET?.trim() || ''
  const requestSecret = getSecretFromRequest(request)

  if (configuredSecret && requestSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Webhook nao autorizado' }, { status: 401 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-webhook-signature') || request.headers.get('x-abacate-signature')

  if (signature && !verifyAbacateWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 })
  }

  try {
    const payload = JSON.parse(rawBody) as WebhookPayload
    const event = payload.event || ''
    const user = await resolveUser(payload)

    if (!user) {
      return NextResponse.json({ ok: true, ignored: 'user_not_found' })
    }

    const plan = resolvePlan(payload) || user.plano
    const subscription = payload.data?.subscription
    const nextCycleDate = addCycle(new Date(), getFrequency(payload))

    if (event === 'subscription.completed' || event === 'subscription.renewed') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plano: plan,
          assinaturaStatus: 'ATIVA',
          assinaturaEndsAt: nextCycleDate,
          abacatepaySubscriptionId: subscription?.id || user.abacatepaySubscriptionId,
        },
      })

      await updatePaymentRecord(user.id, payload, 'PAID', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'subscription.created') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plano: plan,
          abacatepaySubscriptionId: subscription?.id || getEventId(payload) || user.abacatepaySubscriptionId,
        },
      })

      await updatePaymentRecord(user.id, payload, 'PENDING', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'subscription.cancelled') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          assinaturaStatus: 'CANCELADA',
          assinaturaEndsAt: new Date(),
          abacatepaySubscriptionId: subscription?.id || user.abacatepaySubscriptionId,
        },
      })

      await updatePaymentRecord(user.id, payload, 'CANCELLED', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'subscription.canceled') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          assinaturaStatus: 'CANCELADA',
          assinaturaEndsAt: new Date(),
          abacatepaySubscriptionId: subscription?.id || getEventId(payload) || user.abacatepaySubscriptionId,
        },
      })

      await updatePaymentRecord(user.id, payload, 'CANCELLED', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'checkout.completed') {
      await updatePaymentRecord(user.id, payload, 'PAID', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'billing.paid') {
      await updatePaymentRecord(user.id, payload, 'PAID', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'billing.failed') {
      await updatePaymentRecord(user.id, payload, 'FAILED', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'checkout.refunded') {
      await updatePaymentRecord(user.id, payload, 'REFUNDED', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'billing.refunded') {
      await updatePaymentRecord(user.id, payload, 'REFUNDED', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'checkout.disputed') {
      await updatePaymentRecord(user.id, payload, 'DISPUTED', event)
      return NextResponse.json({ ok: true })
    }

    if (event === 'billing.disputed') {
      await updatePaymentRecord(user.id, payload, 'DISPUTED', event)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true, ignored: event || 'unknown' })
  } catch (error) {
    console.error('Erro no webhook da AbacatePay:', error)
    return NextResponse.json({ error: 'Erro ao processar webhook' }, { status: 500 })
  }
}
