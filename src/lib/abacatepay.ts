import crypto from 'node:crypto'

import { PLAN_CATALOG, PlanKey } from '@/lib/plans'

type AbacatePayResponse<T> = {
  data: T
  error: string | null
  success: boolean
}

type AbacateCustomer = {
  id: string
  name?: string
  email: string
  cellphone?: string
  zipCode?: string
}

type AbacateProduct = {
  id: string
  externalId: string
  name: string
  price: number
  cycle?: 'WEEKLY' | 'MONTHLY' | 'SEMIANNUALLY' | 'ANNUALLY' | null
}

type SubscriptionCheckoutStatus =
  | 'PENDING'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PAID'
  | 'REFUNDED'
  | 'ACTIVE'
  | 'COMPLETED'

type AbacateSubscriptionCheckout = {
  id: string
  url: string
  status: SubscriptionCheckoutStatus
  amount: number
  externalId?: string
  paidAmount?: number | null
  customerId?: string | null
  createdAt?: string
  updatedAt?: string
}

type CreateCustomerInput = {
  email: string
  name?: string
  cellphone?: string
  zipCode?: string
}

const ABACATEPAY_API_URL = 'https://api.abacatepay.com/v2'
const ABACATEPAY_PUBLIC_HMAC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9'

function getApiKey() {
  return process.env.ABACATEPAY_API_KEY?.trim() || ''
}

function getCheckoutBaseUrl(fallbackUrl?: string) {
  return fallbackUrl?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || ''
}

async function abacateRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = getApiKey()

  if (!apiKey) {
    throw new Error('ABACATEPAY_API_KEY nao configurada no servidor.')
  }

  const response = await fetch(`${ABACATEPAY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  const json = (await response.json()) as AbacatePayResponse<T>

  if (!response.ok || !json.success) {
    throw new Error(json.error || `Falha na AbacatePay (${response.status}).`)
  }

  return json.data
}

export function isAbacatePayConfigured() {
  return Boolean(getApiKey())
}

export function isSuccessfulSubscriptionStatus(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase()
  return normalized === 'PAID' || normalized === 'ACTIVE' || normalized === 'COMPLETED'
}

export function verifyAbacateWebhookSignature(rawBody: string, signatureFromHeader?: string | null) {
  if (!signatureFromHeader) return false

  const expected = crypto.createHmac('sha256', ABACATEPAY_PUBLIC_HMAC_KEY).update(Buffer.from(rawBody, 'utf8')).digest('base64')
  const received = Buffer.from(signatureFromHeader)
  const expectedBuffer = Buffer.from(expected)

  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer)
}

export async function createAbacateCustomer(input: CreateCustomerInput): Promise<AbacateCustomer | null> {
  if (!isAbacatePayConfigured()) {
    return null
  }

  return abacateRequest<AbacateCustomer>('/customers/create', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      name: input.name,
      cellphone: input.cellphone,
      zipCode: input.zipCode,
      metadata: {
        source: 'radarauto',
      },
    }),
  })
}

async function findProductByExternalId(externalId: string) {
  const query = new URLSearchParams({
    externalId,
    limit: '1',
  })

  const data = await abacateRequest<AbacateProduct[]>(`/products/list?${query.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return data[0] || null
}

async function createPlanProduct(plan: PlanKey) {
  const config = PLAN_CATALOG[plan]

  return abacateRequest<AbacateProduct>('/products/create', {
    method: 'POST',
    body: JSON.stringify({
      externalId: config.externalId,
      name: config.checkoutName,
      description: config.billingDescription,
      price: config.priceCents,
      currency: 'BRL',
      cycle: 'MONTHLY',
    }),
  })
}

export async function ensurePlanProduct(plan: PlanKey) {
  const envProductId = process.env[`ABACATEPAY_PRODUCT_${plan}_ID` as keyof NodeJS.ProcessEnv]
  if (typeof envProductId === 'string' && envProductId.trim()) {
    return { id: envProductId.trim(), externalId: PLAN_CATALOG[plan].externalId }
  }

  const existing = await findProductByExternalId(PLAN_CATALOG[plan].externalId)
  if (existing) {
    return existing
  }

  return createPlanProduct(plan)
}

export async function createSubscriptionCheckout(params: {
  plan: PlanKey
  customerId: string
  userId?: string
  email?: string
  referenceId?: string
  appUrl?: string
  returnUrl?: string
  completionUrl?: string
  metadata?: Record<string, unknown>
}) {
  const appUrl = getCheckoutBaseUrl(params.appUrl)
  const product = await ensurePlanProduct(params.plan)

  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL nao configurada no servidor.')
  }

  const externalId = params.referenceId || `subscription:${params.userId || 'guest'}:${params.plan}:${Date.now()}`

  const checkout = await abacateRequest<AbacateSubscriptionCheckout>('/subscriptions/create', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ id: product.id, quantity: 1 }],
      customerId: params.customerId,
      methods: ['CARD'],
      externalId,
      returnUrl: params.returnUrl || `${appUrl}/assinatura`,
      completionUrl: params.completionUrl || `${appUrl}/assinatura?checkout=success`,
      metadata: {
        userId: params.userId,
        plan: params.plan,
        email: params.email,
        ...(params.metadata || {}),
      },
    }),
  })

  return {
    checkout,
    product,
    externalId,
  }
}

export async function getSubscriptionCheckoutByExternalId(externalId: string) {
  const query = new URLSearchParams({
    externalId,
    limit: '1',
  })

  const data = await abacateRequest<AbacateSubscriptionCheckout[]>(`/subscriptions/list?${query.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return data[0] || null
}

type AbacateSubscription = {
  id: string
  amount: number
  currency?: string
  method?: string
  status: string
  frequency?: 'WEEKLY' | 'MONTHLY' | 'SEMIANNUALLY' | 'ANNUALLY' | null
  customerId?: string | null
  createdAt?: string
  updatedAt?: string
  canceledAt?: string | null
  cancelPolicy?: string | null
  cancelledDueTo?: string | null
}

export async function cancelAbacateSubscription(id: string) {
  return abacateRequest<AbacateSubscription>('/subscriptions/cancel', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}
