type OpportunityInput = {
  baseScore?: number | null
  price?: number | null
  avgMarketPrice?: number | null
  estimatedMargin?: number | null
  imageCount?: number
  year?: number | null
  mileage?: number | null
  title?: string | null
  description?: string | null
  type: 'MOTO' | 'CARRO'
}

export type OpportunityEvaluation = {
  score: number
  reasons: string[]
  confidenceScore: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function computePriceAdvantagePercent(price?: number | null, avgMarketPrice?: number | null) {
  if (!price || !avgMarketPrice || avgMarketPrice <= 0) return 0
  return ((avgMarketPrice - price) / avgMarketPrice) * 100
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

function getExpectedMileagePerYear(type: 'MOTO' | 'CARRO') {
  return type === 'MOTO' ? 8000 : 12000
}

export function evaluateOpportunity(input: OpportunityInput): OpportunityEvaluation {
  let score = Math.round(input.baseScore || 0)
  let confidenceScore = 55
  const reasons: string[] = []

  const margin = input.estimatedMargin || 0
  const priceAdvantagePercent = computePriceAdvantagePercent(input.price, input.avgMarketPrice)
  const imageCount = input.imageCount || 0
  const normalizedTitle = normalizeText(input.title)
  const descriptionLength = normalizeText(input.description).length

  if (priceAdvantagePercent >= 12) {
    score += 8
    confidenceScore += 8
    reasons.push(`Preco ${Math.round(priceAdvantagePercent)}% abaixo da media monitorada`)
  } else if (priceAdvantagePercent >= 6) {
    score += 4
    confidenceScore += 4
    reasons.push(`Preco ${Math.round(priceAdvantagePercent)}% abaixo da media monitorada`)
  } else if (priceAdvantagePercent <= -8) {
    score -= 8
    reasons.push('Preco acima da media monitorada')
  }

  if (margin >= 5000) {
    score += 8
    confidenceScore += 8
    reasons.push(`Margem estimada forte para revenda (${margin.toLocaleString('pt-BR')})`)
  } else if (margin >= 2500) {
    score += 4
    confidenceScore += 4
    reasons.push(`Margem estimada positiva (${margin.toLocaleString('pt-BR')})`)
  } else if (margin > 0 && margin < 1200) {
    score -= 5
    reasons.push('Margem curta para a operacao')
  }

  if (imageCount >= 6) {
    score += 4
    confidenceScore += 6
    reasons.push('Anuncio com boa quantidade de fotos')
  } else if (imageCount <= 1) {
    score -= 4
    confidenceScore -= 8
    reasons.push('Pouca evidencia visual no anuncio')
  }

  if (descriptionLength >= 80) {
    score += 3
    confidenceScore += 6
    reasons.push('Descricao ajuda a validar melhor a oportunidade')
  } else if (descriptionLength > 0 && descriptionLength < 30) {
    confidenceScore -= 4
  }

  if (input.year && input.mileage) {
    const age = Math.max(1, new Date().getFullYear() - input.year + 1)
    const expectedMileage = age * getExpectedMileagePerYear(input.type)

    if (input.mileage <= expectedMileage * 0.75) {
      score += 5
      confidenceScore += 4
      reasons.push('Km abaixo do esperado para o ano')
    } else if (input.mileage >= expectedMileage * 1.35) {
      score -= 5
      reasons.push('Km acima do esperado para o ano')
    }
  }

  if (normalizedTitle.includes('unico dono') || normalizedTitle.includes('único dono')) {
    score += 3
    reasons.push('Historico comercial sugere boa liquidez')
  }

  return {
    score: clamp(score, 0, 100),
    reasons,
    confidenceScore: clamp(confidenceScore, 0, 100),
  }
}
