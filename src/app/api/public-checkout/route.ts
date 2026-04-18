import { randomUUID } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createAbacateCustomer, createSubscriptionCheckout, isAbacatePayConfigured } from '@/lib/abacatepay'
import { signPublicCheckoutToken } from '@/lib/checkout-token'
import { ACTIVE_PLAN_KEY } from '@/lib/plans'

export const dynamic = 'force-dynamic'

const checkoutSchema = z.object({
  plan: z.literal(ACTIVE_PLAN_KEY).default(ACTIVE_PLAN_KEY),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(10).max(20).optional().or(z.literal('')),
})

function normalizeOptional(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export async function POST(request: NextRequest) {
  try {
    if (!isAbacatePayConfigured()) {
      return NextResponse.json({ error: 'AbacatePay nao configurada no servidor.' }, { status: 503 })
    }

    const body = await request.json()
    const data = checkoutSchema.parse(body)
    const customer = await createAbacateCustomer({
      name: data.name,
      email: data.email,
      cellphone: normalizeOptional(data.phone),
    })

    if (!customer?.id) {
      throw new Error('Nao foi possivel criar o cliente na AbacatePay.')
    }

    const referenceId = `public-checkout:${data.plan}:${Date.now()}:${randomUUID().slice(0, 8)}`
    const checkoutToken = signPublicCheckoutToken({
      referenceId,
      plan: data.plan,
      name: data.name,
      email: data.email,
      phone: normalizeOptional(data.phone),
      customerId: customer.id,
    })

    const successUrl = new URL('/checkout/sucesso', request.nextUrl.origin)
    successUrl.searchParams.set('checkoutToken', checkoutToken)

    const returnUrl = new URL('/checkout', request.nextUrl.origin)
    returnUrl.searchParams.set('plan', ACTIVE_PLAN_KEY)

    const { checkout } = await createSubscriptionCheckout({
      plan: data.plan,
      customerId: customer.id,
      email: data.email,
      referenceId,
      appUrl: request.nextUrl.origin,
      returnUrl: returnUrl.toString(),
      completionUrl: successUrl.toString(),
      metadata: {
        source: 'public-checkout',
        customerEmail: data.email,
      },
    })

    return NextResponse.json({
      checkoutUrl: checkout.url,
      checkoutToken,
      externalId: referenceId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados invalidos', details: error.flatten() }, { status: 400 })
    }

    if (error instanceof Error && /version mismatch/i.test(error.message)) {
      return NextResponse.json(
        { error: 'A chave informada nao bate com a API v2 da AbacatePay. Gere uma chave v2 no painel e atualize o .env local.' },
        { status: 400 }
      )
    }

    console.error('Erro ao criar checkout publico:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar checkout publico' },
      { status: 500 }
    )
  }
}
