type RiskInput = {
  baseScore?: number | null
  price?: number | null
  avgMarketPrice?: number | null
  estimatedMargin?: number | null
  imageCount?: number
  title?: string | null
  description?: string | null
  city?: string | null
  state?: string | null
}

export type RiskEvaluation = {
  score: number
  reasons: string[]
}

const HIGH_RISK_TERMS = [
  'leilao',
  'sinistro',
  'sem documento',
  'sem doc',
  'motor fumando',
  'nao funciona',
  'nao liga',
  'busca e apreensao',
  'alienado',
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function computePriceDistortionPercent(price?: number | null, avgMarketPrice?: number | null) {
  if (!price || !avgMarketPrice || avgMarketPrice <= 0) return 0
  return ((avgMarketPrice - price) / avgMarketPrice) * 100
}

export function deriveRiskLevelFromScore(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 75) return 'HIGH'
  if (score >= 45) return 'MEDIUM'
  return 'LOW'
}

export function evaluateRisk(input: RiskInput): RiskEvaluation {
  let score = Math.round(input.baseScore || 0)
  const reasons: string[] = []

  const combinedText = normalizeText([input.title, input.description].filter(Boolean).join(' '))
  const imageCount = input.imageCount || 0
  const priceDistortionPercent = computePriceDistortionPercent(input.price, input.avgMarketPrice)

  const matchedRiskTerms = HIGH_RISK_TERMS.filter((term) => combinedText.includes(term))
  if (matchedRiskTerms.length > 0) {
    score += matchedRiskTerms.length * 6
    reasons.push(`Termos de risco detectados: ${matchedRiskTerms.slice(0, 2).join(', ')}`)
  }

  if (!input.description || normalizeText(input.description).length < 30) {
    score += 5
    reasons.push('Descricao muito curta para validar o anuncio')
  }

  if (imageCount <= 1) {
    score += 6
    reasons.push('Poucas fotos aumentam incerteza')
  }

  if (priceDistortionPercent >= 20) {
    score += 8
    reasons.push(`Preco ${Math.round(priceDistortionPercent)}% abaixo da media exige validacao extra`)
  }

  if ((input.estimatedMargin || 0) < 0) {
    score += 5
    reasons.push('Margem negativa sugere leitura comercial ruim')
  }

  if (!input.city && !input.state) {
    score += 3
    reasons.push('Localizacao incompleta no anuncio')
  }

  if (input.city && !input.state) {
    score += 2
    reasons.push('Estado ausente reduz confianca geografica')
  }

  return {
    score: clamp(score, 0, 100),
    reasons,
  }
}
