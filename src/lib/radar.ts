export type RadarConfigLike = {
  ativo?: boolean
  autoScanEnabled?: boolean
  modelos?: string[]
  fontes?: string[]
  seedUrls?: string[]
  tipo?: string
  precoMax?: number
  kmMax?: number
  distanciaMax?: number
  scoreMin?: number
  riscoMax?: string
  anoMin?: number
  margemMin?: number
  frequenciaMin?: number
  scoreAlerta?: number
  lastScanAt?: Date | string | null
  nextScanAt?: Date | string | null
}

export type RadarListingLike = {
  id?: string
  title: string
  brand?: string | null
  model?: string | null
  price: number
  type: string
  source: string
  year?: number | null
  mileage?: number | null
  distanceKm?: number | null
  opportunityScore?: number | null
  estimatedMargin?: number | null
  riskLevel?: string | null
  sourceUrl?: string | null
  createdAt?: Date | string
  updatedAt?: Date | string
  userId?: string
  status?: string
  isDiscarded?: boolean
  isFavorite?: boolean
  alertSent?: boolean
}

export const DEFAULT_RADAR_CONFIG: Required<RadarConfigLike> = {
  ativo: true,
  autoScanEnabled: true,
  modelos: ['XRE 300', 'CB 500', 'Fazer 250'],
  fontes: ['mercadolivre', 'olx', 'manual'],
  seedUrls: [],
  tipo: 'TODOS',
  precoMax: 35000,
  kmMax: 80000,
  distanciaMax: 120,
  scoreMin: 70,
  riscoMax: 'MEDIO',
  anoMin: 2018,
  margemMin: 1500,
  frequenciaMin: 60,
  scoreAlerta: 75,
  lastScanAt: null,
  nextScanAt: null,
}

export function safeNumber(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function normalizeRadarConfig(config?: RadarConfigLike | null): Required<RadarConfigLike> {
  return {
    ...DEFAULT_RADAR_CONFIG,
    ...(config || {}),
    modelos: Array.isArray(config?.modelos) ? config.modelos : DEFAULT_RADAR_CONFIG.modelos,
    fontes: Array.isArray(config?.fontes) ? config.fontes.map((item) => item.toLowerCase()) : DEFAULT_RADAR_CONFIG.fontes,
    seedUrls: Array.isArray(config?.seedUrls) ? config.seedUrls : DEFAULT_RADAR_CONFIG.seedUrls,
  }
}

export function matchesRadar(listing: RadarListingLike, config?: RadarConfigLike | null) {
  const normalized = normalizeRadarConfig(config)
  const opportunityScore = safeNumber(listing.opportunityScore)
  const mileage = safeNumber(listing.mileage)
  const distance = safeNumber(listing.distanceKm)
  const year = safeNumber(listing.year)
  const margin = safeNumber(listing.estimatedMargin)
  const source = listing.source.toLowerCase()
  const riskLevel = listing.riskLevel || 'MEDIUM'

  if (!normalized.ativo) return false
  if (normalized.tipo !== 'TODOS' && listing.type !== normalized.tipo) return false
  if (listing.price > normalized.precoMax) return false
  if (mileage > normalized.kmMax) return false
  if (distance > normalized.distanciaMax) return false
  if (year > 0 && year < normalized.anoMin) return false
  if (margin > 0 && margin < normalized.margemMin) return false
  if (opportunityScore < normalized.scoreAlerta) return false
  if (normalized.fontes.length > 0 && !normalized.fontes.includes(source)) return false
  if (normalized.riscoMax === 'BAIXO' && riskLevel !== 'LOW') return false
  if (normalized.riscoMax === 'MEDIO' && riskLevel === 'HIGH') return false

  if (normalized.modelos.length > 0) {
    const haystack = `${listing.title} ${listing.brand || ''} ${listing.model || ''}`.toLowerCase()
    const modelMatched = normalized.modelos.some((model) => haystack.includes(model.toLowerCase()))

    if (!modelMatched) return false
  }

  return true
}

export function formatRiskLabel(value?: string) {
  if (value === 'BAIXO' || value === 'LOW') return 'Baixo'
  if (value === 'ALTO' || value === 'HIGH') return 'Alto'
  return 'Medio'
}

export function formatSourceLabel(value: string) {
  if (value === 'olx') return 'OLX'
  if (value === 'olxpro') return 'OLX Pro'
  if (value === 'facebook') return 'Facebook'
  if (value === 'webmotors') return 'Webmotors'
  if (value === 'mercadolivre') return 'Mercado Livre'
  if (value === 'icarros') return 'iCarros'
  if (value === 'kavak') return 'Kavak'
  if (value === 'queroquero') return 'Quero-Quero'
  if (value === 'manual') return 'Manual'
  return value
}
