export type VehicleType = 'MOTO' | 'CARRO'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type ListingStatus = 'PENDING' | 'ANALYZED' | 'ALERTED' | 'DISCARDED'

export interface ListingAlertContext {
  createdAt: string
  sent: boolean
  errorMsg?: string | null
}

export interface ListingReviewContext {
  status: 'APPROVED' | 'REJECTED'
  note?: string | null
  decidedAt: string
}

export interface Listing {
  id: string
  createdAt: string
  deletedAt?: string | null
  title: string
  description?: string
  price: number
  type: VehicleType
  source: string
  sourceUrl?: string
  imageUrls: string[]
  brand?: string
  model?: string
  year?: number
  mileage?: number
  city?: string
  state?: string
  distanceKm?: number
  opportunityScore?: number
  riskScore?: number
  riskLevel?: RiskLevel
  aiSummary?: string
  positiveSignals: string[]
  alertSignals: string[]
  fipePrice?: number
  avgMarketPrice?: number
  estimatedMargin?: number
  status: ListingStatus
  alertSent: boolean
  isFavorite: boolean
  isDiscarded: boolean
  latestAlert?: ListingAlertContext | null
  reviewDecision?: ListingReviewContext | null
}

export interface AnalysisResult {
  titulo: string
  score_oportunidade: number
  score_risco: number
  nivel_risco: 'Baixo' | 'Medio' | 'Alto'
  margem_estimada: string
  resumo: string
  sinais_positivos: string[]
  sinais_alerta: string[]
  fipe_estimada?: number
  media_mercado?: number
  modo_analise?: 'IA' | 'HEURISTICA'
  observacao?: string
}

export interface AlertConfig {
  id: string
  minOpportunity: number
  maxRisk: string
  maxDistanceKm: number
  monitorMotos: boolean
  monitorCarros: boolean
  telegramEnabled: boolean
  telegramChatId?: string
  whatsappEnabled: boolean
  whatsappPhone?: string
}

export interface DashboardStats {
  totalToday: number
  strongOpportunities: number
  avgMargin: number
  alertsSent: number
}
