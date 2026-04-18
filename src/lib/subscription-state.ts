type PaymentLike = {
  status: string
  createdAt?: Date | null
  abacatepayId?: string | null
  abacatepayPaymentId?: string | null
}

type SubscriptionUserLike = {
  assinaturaStatus: string
  trialEndsAt?: Date | null
  assinaturaEndsAt?: Date | null
  abacatepayCustomerId?: string | null
  abacatepaySubscriptionId?: string | null
}

const SUCCESS_STATUSES = new Set(['PAID', 'CONFIRMADO', 'CONFIRMED', 'RECEIVED', 'ACTIVE', 'COMPLETED'])
const PENDING_STATUSES = new Set(['PENDING', 'PENDENTE', 'PROCESSING', 'WAITING_PAYMENT'])
const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'EXPIRED'])
const REFUNDED_STATUSES = new Set(['REFUNDED'])
const DISPUTED_STATUSES = new Set(['DISPUTED', 'CHARGEBACK'])
const FAILED_STATUSES = new Set(['FAILED', 'ERROR'])

export function normalizeBillingStatus(status?: string | null) {
  return String(status || '').trim().toUpperCase()
}

export function isSuccessfulBillingStatus(status?: string | null) {
  return SUCCESS_STATUSES.has(normalizeBillingStatus(status))
}

export function isPendingBillingStatus(status?: string | null) {
  return PENDING_STATUSES.has(normalizeBillingStatus(status))
}

export function getBillingStatusTone(status?: string | null) {
  const normalized = normalizeBillingStatus(status)

  if (SUCCESS_STATUSES.has(normalized)) return 'success'
  if (PENDING_STATUSES.has(normalized)) return 'warning'
  if (CANCELLED_STATUSES.has(normalized)) return 'muted'
  if (REFUNDED_STATUSES.has(normalized) || DISPUTED_STATUSES.has(normalized) || FAILED_STATUSES.has(normalized)) return 'danger'
  return 'default'
}

export function formatSubscriptionStatus(status?: string | null) {
  switch (normalizeBillingStatus(status)) {
    case 'TRIAL':
      return 'trial'
    case 'ATIVA':
      return 'ativa'
    case 'CANCELADA':
      return 'cancelada'
    case 'SUSPENSA':
      return 'suspensa'
    case 'ENCERRADA':
      return 'encerrada'
    case 'PENDENTE_CHECKOUT':
      return 'aguardando checkout'
    default:
      return 'em andamento'
  }
}

function hasPaymentLink(payment: PaymentLike) {
  return Boolean(payment.abacatepayId || payment.abacatepayPaymentId)
}

export function inferSubscriptionState(user: SubscriptionUserLike, payments: PaymentLike[]) {
  const now = new Date()
  const hasBillingProfile = Boolean(user.abacatepayCustomerId)
  const hasSubscriptionLink = Boolean(user.abacatepaySubscriptionId)
  const linkedPayments = payments.filter(hasPaymentLink)
  const latestLinkedPayment = linkedPayments[0] || null
  const latestLinkedPaymentStatus = normalizeBillingStatus(latestLinkedPayment?.status)
  const hasLinkedPayment = linkedPayments.length > 0
  const hasConfirmedBilling = hasSubscriptionLink || linkedPayments.some((payment) => isSuccessfulBillingStatus(payment.status))
  const hasPendingCheckout = linkedPayments.some((payment) => isPendingBillingStatus(payment.status))
  const trialActive = Boolean(user.trialEndsAt && user.trialEndsAt.getTime() > now.getTime())

  let effectiveStatus = user.assinaturaStatus

  if (user.assinaturaStatus === 'CANCELADA' || user.assinaturaStatus === 'SUSPENSA' || user.assinaturaStatus === 'ENCERRADA') {
    effectiveStatus = user.assinaturaStatus
  } else if (hasConfirmedBilling) {
    effectiveStatus = 'ATIVA'
  } else if (trialActive || user.assinaturaStatus === 'TRIAL') {
    effectiveStatus = 'TRIAL'
  } else {
    effectiveStatus = 'PENDENTE_CHECKOUT'
  }

  return {
    effectiveStatus,
    trialActive,
    hasBillingProfile,
    hasSubscriptionLink,
    hasLinkedPayment,
    hasConfirmedBilling,
    hasPendingCheckout,
    latestLinkedPaymentStatus,
    latestLinkedPaymentAt: latestLinkedPayment?.createdAt || null,
    checkoutRequired: effectiveStatus !== 'ATIVA',
    canCancel: effectiveStatus === 'ATIVA' && hasSubscriptionLink,
    canCreateCheckout: effectiveStatus !== 'ATIVA',
  }
}

