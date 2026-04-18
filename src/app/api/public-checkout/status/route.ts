import { NextRequest, NextResponse } from 'next/server'

import { getSubscriptionCheckoutByExternalId, isAbacatePayConfigured } from '@/lib/abacatepay'
import { verifyPublicCheckoutToken } from '@/lib/checkout-token'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    if (!isAbacatePayConfigured()) {
      return NextResponse.json({ error: 'AbacatePay nao configurada no servidor.' }, { status: 503 })
    }

    const checkoutToken = request.nextUrl.searchParams.get('checkoutToken') || ''

    if (!checkoutToken) {
      return NextResponse.json({ error: 'Token de checkout ausente.' }, { status: 400 })
    }

    const token = verifyPublicCheckoutToken(checkoutToken)
    const checkout = await getSubscriptionCheckoutByExternalId(token.referenceId)

    if (!checkout) {
      return NextResponse.json({ error: 'Checkout nao encontrado.' }, { status: 404 })
    }

    return NextResponse.json({
      plan: token.plan,
      name: token.name,
      email: token.email,
      phone: token.phone || '',
      referenceId: token.referenceId,
      customerId: token.customerId,
      checkout: {
        id: checkout.id,
        status: checkout.status,
        amount: checkout.amount,
        paidAmount: checkout.paidAmount || 0,
      },
    })
  } catch (error) {
    console.error('Erro ao consultar checkout publico:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao consultar checkout publico' },
      { status: 500 }
    )
  }
}
