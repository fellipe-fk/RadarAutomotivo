import type { RadarConfigLike } from '@/lib/radar'
import { normalizeRadarConfig, safeNumber } from '@/lib/radar'

type AlertPolicyListing = {
  opportunityScore?: number | null
  riskScore?: number | null
  riskLevel?: string | null
  estimatedMargin?: number | null
  price: number
  avgMarketPrice?: number | null
  positiveSignals: string[]
  alertSignals: string[]
  aiSummary?: string | null
}

export interface AlertPolicyDecision {
  allowed: boolean
  reasons: string[]
}

export function evaluateAlertEligibility(listing: AlertPolicyListing, config?: RadarConfigLike | null): AlertPolicyDecision {
  const normalizedConfig = normalizeRadarConfig(config)
  const reasons: string[] = []

  const opportunityScore = safeNumber(listing.opportunityScore)
  const riskScore = safeNumber(listing.riskScore)
  const estimatedMargin = listing.estimatedMargin
  const positiveSignalCount = listing.positiveSignals.length
  const riskSignalCount = listing.alertSignals.length

  if (opportunityScore < normalizedConfig.scoreAlerta) {
    reasons.push(`Score ${opportunityScore} abaixo do corte de alerta ${normalizedConfig.scoreAlerta}`)
  }

  if (typeof estimatedMargin === 'number' && estimatedMargin <= 0) {
    reasons.push('Margem nao positiva para justificar alerta automatico')
  }

  if ((listing.riskLevel || '').toUpperCase() === 'HIGH' || riskScore >= 80) {
    reasons.push('Risco alto demais para envio automatico')
  }

  if (listing.avgMarketPrice && listing.price > listing.avgMarketPrice * 1.02) {
    reasons.push('Preco nao esta abaixo da referencia monitorada')
  }

  if (positiveSignalCount === 0 && !listing.aiSummary) {
    reasons.push('Pouca explicacao comercial para sustentar o alerta')
  }

  if (riskSignalCount >= 5 && riskScore >= 60) {
    reasons.push('Quantidade de sinais de alerta ainda esta elevada')
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  }
}
