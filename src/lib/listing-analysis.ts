import { analyzeAd, analyzeAdLocally, type AnalyzeInput, getAnalysisFailureMessage } from '@/lib/analyzer'

export const analysisRiskMap = {
  Baixo: 'LOW',
  Medio: 'MEDIUM',
  Alto: 'HIGH',
} as const

export async function runAnalysisWithFallback(input: AnalyzeInput) {
  try {
    const analysis = await analyzeAd(input)
    return { analysis, fallbackReason: null as string | null }
  } catch (analysisError) {
    const fallbackReason = getAnalysisFailureMessage(analysisError)
    console.warn('IA principal indisponivel, usando analise local:', fallbackReason)
    const analysis = await analyzeAdLocally(input, fallbackReason)
    return { analysis, fallbackReason }
  }
}

export function parseEstimatedMarginValue(value?: string | null) {
  if (!value) return undefined

  const matches = value.match(/-?\d[\d.]*/g)

  if (!matches || matches.length === 0) return undefined

  const values = matches
    .map((entry) => Number(entry.replace(/\./g, '')))
    .filter((entry) => Number.isFinite(entry))

  if (values.length === 0) return undefined
  if (values.length === 1) return values[0]

  return Math.round(values.reduce((total, current) => total + current, 0) / values.length)
}
