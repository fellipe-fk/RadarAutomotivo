import { getFipeBrands, getFipeModels, getFipePrice, getFipeYears, parseFipePrice } from '@/lib/fipe'
import { getSystemOpenAiApiKey } from '@/lib/system-status'
import { AnalysisResult } from '@/types'

export interface AnalyzeInput {
  type: 'MOTO' | 'CARRO'
  title?: string
  description?: string
  price?: number
  mileage?: number
  year?: number
  city?: string
  sourceUrl?: string
  sourceContext?: string
  brand?: string
  model?: string
}

type FipeItem = {
  codigo: string
  nome: string
}

type FipeReference = {
  fipePrice: number
  avgMarketPrice: number
  matchedBrand?: string
  matchedModel?: string
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini'

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titulo: { type: 'string' },
    score_oportunidade: { type: 'number' },
    score_risco: { type: 'number' },
    nivel_risco: { type: 'string', enum: ['Baixo', 'Medio', 'Alto'] },
    fipe_estimada: { type: ['number', 'null'] },
    media_mercado: { type: ['number', 'null'] },
    margem_estimada: { type: 'string' },
    resumo: { type: 'string' },
    sinais_positivos: {
      type: 'array',
      items: { type: 'string' },
    },
    sinais_alerta: {
      type: 'array',
      items: { type: 'string' },
    },
    modo_analise: { type: 'string', enum: ['IA'] },
  },
  required: [
    'titulo',
    'score_oportunidade',
    'score_risco',
    'nivel_risco',
    'fipe_estimada',
    'media_mercado',
    'margem_estimada',
    'resumo',
    'sinais_positivos',
    'sinais_alerta',
    'modo_analise',
  ],
} as const

const RISK_TERMS = [
  'leilao',
  'sinistro',
  'batido',
  'enchente',
  'recibo',
  'sem documento',
  'sem doc',
  'alienado',
  'busca e apreensao',
  'baixado',
  'motor fumando',
  'precisa fazer',
  'nao funciona',
  'nao liga',
  'problema',
]

const POSITIVE_TERMS = [
  'manual',
  'chave reserva',
  'revisado',
  'revisoes em dia',
  'nota fiscal',
  'unico dono',
  'segunda dona',
  'procedencia',
  'original',
  'pneus novos',
  'garantia',
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

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function computeMatchScore(hint: string, candidate: string) {
  if (!hint || !candidate) return 0
  if (hint === candidate) return 100
  if (hint.includes(candidate) || candidate.includes(hint)) return 60

  const hintTokens = hint.split(/\s+/).filter((token) => token.length > 2)
  const candidateTokens = candidate.split(/\s+/).filter((token) => token.length > 2)
  const shared = candidateTokens.reduce((count, token) => (hintTokens.includes(token) ? count + 1 : count), 0)
  return shared * 10
}

function formatMoneyRange(low: number, high: number) {
  const lower = Math.round(Math.min(low, high))
  const upper = Math.round(Math.max(low, high))
  return `R$ ${lower.toLocaleString('pt-BR')} a R$ ${upper.toLocaleString('pt-BR')}`
}

function deriveVehicleName(input: AnalyzeInput, reference?: FipeReference | null) {
  const baseTitle = input.title?.trim()
  if (baseTitle) return baseTitle

  const parts = [reference?.matchedBrand, reference?.matchedModel, input.year ? String(input.year) : ''].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')

  return input.type === 'MOTO' ? 'Moto anunciada' : 'Carro anunciado'
}

function deriveLiquidityScore(title: string, type: 'MOTO' | 'CARRO') {
  const normalized = normalizeText(title)
  const highLiquidity =
    type === 'MOTO'
      ? ['xre', 'cg', 'biz', 'fazer', 'titan', 'bros', 'cb 500', 'pcx']
      : ['corolla', 'civic', 'gol', 'hb20', 'onix', 'nivus', 'hilux', 'uno']

  if (highLiquidity.some((token) => normalized.includes(token))) return 8
  return 0
}

async function resolveFipeReference(input: AnalyzeInput): Promise<FipeReference | null> {
  if (!input.year) return null

  const type = input.type === 'MOTO' ? 'motos' : 'carros'
  const brandHint = normalizeText(input.brand || input.title)
  const modelHint = normalizeText(input.model || input.title)

  if (!brandHint || !modelHint) return null

  try {
    const brands = (await getFipeBrands(type)) as FipeItem[]
    const matchedBrand = brands
      .map((brand) => ({
        ...brand,
        score: computeMatchScore(brandHint, normalizeText(brand.nome)),
      }))
      .filter((brand) => brand.score > 0)
      .sort((left, right) => right.score - left.score)[0]

    if (!matchedBrand) return null

    const modelsResponse = (await getFipeModels(type, matchedBrand.codigo)) as { modelos?: FipeItem[] }
    const models = Array.isArray(modelsResponse?.modelos) ? modelsResponse.modelos : []

    const matchedModel = models
      .map((model) => ({
        ...model,
        score: computeMatchScore(modelHint, normalizeText(model.nome)),
      }))
      .filter((model) => model.score > 0)
      .sort((left, right) => right.score - left.score)[0]

    if (!matchedModel) return null

    const years = (await getFipeYears(type, matchedBrand.codigo, matchedModel.codigo)) as FipeItem[]
    const matchedYear =
      years.find((entry) => entry.codigo.startsWith(String(input.year))) ||
      years.find((entry) => normalizeText(entry.nome).includes(String(input.year)))

    if (!matchedYear) return null

    const fipe = await getFipePrice(type, matchedBrand.codigo, matchedModel.codigo, matchedYear.codigo)
    const fipePrice = parseFipePrice(fipe.Valor)

    if (!Number.isFinite(fipePrice) || fipePrice <= 0) return null

    return {
      fipePrice,
      avgMarketPrice: fipePrice * 0.985,
      matchedBrand: titleCase(matchedBrand.nome),
      matchedModel: titleCase(matchedModel.nome),
    }
  } catch (error) {
    console.warn('FIPE indisponivel para esta analise:', error)
    return null
  }
}

function extractSignals(context: string, terms: string[]) {
  return terms.filter((term) => context.includes(term))
}

function buildHeuristicSummary(params: {
  title: string
  deltaPercent: number
  marginHigh: number
  riskLevel: 'Baixo' | 'Medio' | 'Alto'
  fallbackReason?: string
}) {
  const priceView =
    params.deltaPercent >= 8
      ? 'O preco esta abaixo da referencia estimada, o que abre espaco para revenda.'
      : params.deltaPercent <= -8
        ? 'O preco esta esticado frente a referencia estimada, reduzindo a atratividade.'
        : 'O preco esta perto da referencia estimada do mercado.'

  const marginView =
    params.marginHigh > 0
      ? 'Ha margem potencial para revenda depois dos custos basicos.'
      : 'A margem projetada esta apertada e pede negociacao melhor.'

  const modeView = params.fallbackReason
    ? `Analise local automatica aplicada porque a IA principal ficou indisponivel (${params.fallbackReason}).`
    : 'Analise local automatica aplicada com base no anuncio e referencias de mercado.'

  return `${modeView} ${params.title}: ${priceView} ${marginView} Risco ${params.riskLevel.toLowerCase()} nesta leitura inicial.`
}

function parseOpenAiOutputText(data: unknown) {
  if (data && typeof data === 'object' && 'output_text' in data && typeof (data as { output_text?: unknown }).output_text === 'string') {
    return (data as { output_text: string }).output_text
  }

  if (!data || typeof data !== 'object' || !('output' in data) || !Array.isArray((data as { output?: unknown[] }).output)) {
    return ''
  }

  const output = (data as { output: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }).output

  return output
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text as string)
    .join('')
}

async function analyzeWithOpenAi(input: AnalyzeInput): Promise<AnalysisResult> {
  const apiKey = getSystemOpenAiApiKey()

  if (!apiKey) {
    throw new Error('A chave da OpenAI do sistema nao foi configurada no servidor.')
  }

  const prompt = `Voce e um especialista em avaliacao de anuncios de veiculos usados para revenda no Brasil.

Dados do anuncio:
- Tipo: ${input.type === 'MOTO' ? 'Moto' : 'Carro'}
${input.title ? `- Titulo: ${input.title}` : ''}
${input.brand ? `- Marca: ${input.brand}` : ''}
${input.model ? `- Modelo: ${input.model}` : ''}
${input.description ? `- Descricao: ${input.description}` : ''}
${input.price ? `- Preco pedido: R$ ${input.price.toLocaleString('pt-BR')}` : ''}
${input.mileage ? `- Quilometragem: ${input.mileage.toLocaleString('pt-BR')} km` : ''}
${input.year ? `- Ano: ${input.year}` : ''}
${input.city ? `- Cidade: ${input.city}` : ''}
${input.sourceUrl ? `- Link: ${input.sourceUrl}` : ''}
${input.sourceContext ? `- Contexto extraido da pagina: ${input.sourceContext}` : ''}

Analise este anuncio considerando:
1. Relacao preco vs tabela FIPE estimada para o modelo
2. Km coerente com o ano do veiculo
3. Sinais de urgencia de venda na descricao
4. Sinais de risco ou possivel golpe
5. Margem de revenda estimada apos custos basicos
6. Liquidez do modelo no mercado brasileiro

Retorne o JSON exatamente no schema solicitado.`

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'vehicle_analysis',
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(errorBody || `Falha na OpenAI (${response.status}).`)
  }

  const data = (await response.json()) as unknown
  const outputText = parseOpenAiOutputText(data)

  if (!outputText) {
    throw new Error('A OpenAI nao retornou texto estruturado para esta analise.')
  }

  const parsed = JSON.parse(outputText) as AnalysisResult
  return {
    ...parsed,
    modo_analise: 'IA',
  }
}

export function getAnalysisFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha na analise.'
  const normalized = normalizeText(message)

  if (normalized.includes('fetch failed') || normalized.includes('network') || normalized.includes('timeout')) {
    return 'falha de rede ao acessar OpenAI'
  }

  if (normalized.includes('invalid api key') || normalized.includes('incorrect api key') || normalized.includes('authentication')) {
    return 'chave invalida da OpenAI'
  }

  if (normalized.includes('model_not_found') || normalized.includes('does not exist')) {
    return 'modelo da OpenAI indisponivel ou invalido'
  }

  if (normalized.includes('unsupported parameter')) {
    return 'payload incompatível com o modelo configurado'
  }

  if (normalized.includes('credit balance is too low') || normalized.includes('purchase credits') || normalized.includes('insufficient_quota')) {
    return 'saldo insuficiente no provedor de IA'
  }

  if (normalized.includes('openai')) {
    return 'falha na OpenAI'
  }

  if (normalized.includes('chave da openai') || normalized.includes('chave da ia')) {
    return 'chave do servidor nao configurada'
  }

  if (normalized.includes('overloaded') || normalized.includes('rate limit')) {
    return 'limite temporario do provedor'
  }

  return 'indisponibilidade temporaria da IA principal'
}

export async function analyzeAd(input: AnalyzeInput): Promise<AnalysisResult> {
  const openAiKey = getSystemOpenAiApiKey()

  if (openAiKey) {
    return analyzeWithOpenAi(input)
  }

  throw new Error('A chave da OpenAI do sistema nao foi configurada no servidor.')
}

export async function analyzeAdLocally(input: AnalyzeInput, fallbackReason?: string): Promise<AnalysisResult> {
  const reference = await resolveFipeReference(input)
  const title = deriveVehicleName(input, reference)
  const price = input.price || 0
  const normalizedContext = normalizeText([input.title, input.description, input.sourceContext].filter(Boolean).join(' '))

  const baselineReference = reference?.fipePrice || (price > 0 ? price * (input.type === 'MOTO' ? 1.1 : 1.12) : 0)
  const marketAverage = reference?.avgMarketPrice || (baselineReference > 0 ? baselineReference * 0.985 : price)
  const deltaPercent = baselineReference > 0 && price > 0 ? ((baselineReference - price) / baselineReference) * 100 : 0

  let opportunity = 58
  let risk = 26

  const positiveSignals: string[] = []
  const alertSignals: string[] = []

  if (deltaPercent >= 12) {
    opportunity += 22
    positiveSignals.push(`${Math.round(deltaPercent)}% abaixo da referencia`)
  } else if (deltaPercent >= 6) {
    opportunity += 12
    positiveSignals.push('Preco abaixo da referencia')
  } else if (deltaPercent <= -8) {
    opportunity -= 14
    alertSignals.push('Preco acima da referencia')
  }

  if (input.year) {
    const currentYear = new Date().getFullYear()
    const age = Math.max(0, currentYear - input.year)
    const expectedMileage = Math.max(5000, age * (input.type === 'MOTO' ? 8000 : 12000))

    if (input.mileage) {
      const mileageRatio = input.mileage / expectedMileage
      if (mileageRatio <= 0.8) {
        opportunity += 8
        positiveSignals.push('Km abaixo do esperado para o ano')
      } else if (mileageRatio >= 1.35) {
        risk += 16
        alertSignals.push('Km acima do esperado para o ano')
      }
    }
  }

  for (const term of extractSignals(normalizedContext, POSITIVE_TERMS)) {
    opportunity += 3
    if (positiveSignals.length < 5) {
      positiveSignals.push(`Indicio positivo: ${term}`)
    }
  }

  for (const term of extractSignals(normalizedContext, RISK_TERMS)) {
    risk += 8
    opportunity -= 3
    if (alertSignals.length < 3) {
      alertSignals.push(`Ponto de atencao: ${term}`)
    }
  }

  opportunity += deriveLiquidityScore(title, input.type)

  const costBase = input.type === 'MOTO' ? 1200 : 2500
  const lowMargin = marketAverage * 0.95 - price - costBase
  const highMargin = marketAverage * 1.01 - price - costBase

  if (highMargin > 1500) {
    opportunity += 10
    positiveSignals.push('Margem potencial acima da media')
  } else if (highMargin < 500) {
    risk += 10
    alertSignals.push('Margem apertada para revenda')
  }

  risk = clamp(Math.round(risk), 8, 95)
  opportunity = clamp(Math.round(opportunity), 18, 96)

  const nivelRisco: AnalysisResult['nivel_risco'] = risk >= 65 ? 'Alto' : risk >= 35 ? 'Medio' : 'Baixo'
  const observacao = fallbackReason
    ? `Analise local automatica usada porque a IA principal ficou indisponivel: ${fallbackReason}.`
    : 'Analise local automatica usada pelo sistema.'

  return {
    titulo: title,
    score_oportunidade: opportunity,
    score_risco: risk,
    nivel_risco: nivelRisco,
    fipe_estimada: baselineReference > 0 ? Math.round(baselineReference) : undefined,
    media_mercado: marketAverage > 0 ? Math.round(marketAverage) : undefined,
    margem_estimada: formatMoneyRange(lowMargin, highMargin),
    resumo: buildHeuristicSummary({
      title,
      deltaPercent,
      marginHigh: highMargin,
      riskLevel: nivelRisco,
      fallbackReason,
    }),
    sinais_positivos: positiveSignals.slice(0, 5),
    sinais_alerta: alertSignals.slice(0, 3),
    modo_analise: 'HEURISTICA',
    observacao,
  }
}

export function buildAlertMessage(listing: {
  title: string
  price: number
  city?: string
  distanceKm?: number
  opportunityScore?: number
  riskLevel?: string
  estimatedMargin?: number
  aiSummary?: string
  sourceUrl?: string
}): string {
  const riskIcon = listing.riskLevel === 'LOW' ? '[baixo]' : listing.riskLevel === 'MEDIUM' ? '[medio]' : '[alto]'
  const riskLabel = listing.riskLevel === 'LOW' ? 'Baixo' : listing.riskLevel === 'MEDIUM' ? 'Medio' : 'Alto'

  return `Oportunidade encontrada
${listing.title} | R$ ${listing.price.toLocaleString('pt-BR')}
Local: ${listing.city || 'Nao informado'}${listing.distanceKm ? ` | ${listing.distanceKm} km de voce` : ''}
Score: ${listing.opportunityScore || 0}/100
${riskIcon} Risco: ${riskLabel}
${listing.estimatedMargin ? `Margem estimada: R$ ${listing.estimatedMargin.toLocaleString('pt-BR')}` : ''}

${listing.aiSummary || ''}
${listing.sourceUrl ? `\nVer anuncio: ${listing.sourceUrl}` : ''}
Painel: ${process.env.NEXT_PUBLIC_APP_URL}/oportunidades`
}
