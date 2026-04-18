import jwt from 'jsonwebtoken'

import { ACTIVE_PLAN_KEY, type PlanKey } from '@/lib/plans'

export type CheckoutPlan = PlanKey

type PublicCheckoutTokenPayload = {
  type: 'public-checkout'
  referenceId: string
  plan: CheckoutPlan
  name: string
  email: string
  phone?: string
  customerId: string
}

function getJwtSecret() {
  const secret = process.env.NEXTAUTH_SECRET

  if (!secret || secret.length < 32) {
    throw new Error('NEXTAUTH_SECRET invalido ou ausente')
  }

  return secret
}

export function signPublicCheckoutToken(payload: Omit<PublicCheckoutTokenPayload, 'type'>) {
  return jwt.sign(
    {
      ...payload,
      type: 'public-checkout',
    } satisfies PublicCheckoutTokenPayload,
    getJwtSecret(),
    { expiresIn: '2d' }
  )
}

export function verifyPublicCheckoutToken(token: string) {
  const decoded = jwt.verify(token, getJwtSecret()) as PublicCheckoutTokenPayload

  if (decoded.type !== 'public-checkout') {
    throw new Error('Token de checkout invalido')
  }

  return {
    ...decoded,
    plan: ACTIVE_PLAN_KEY,
  }
}
