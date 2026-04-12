const FIPE_BASE = process.env.FIPE_API_URL || 'https://parallelum.com.br/fipe/api/v1'

export async function getFipeBrands(type: 'motos' | 'carros') {
  const res = await fetch(`${FIPE_BASE}/${type}/marcas`)
  if (!res.ok) throw new Error('Erro ao buscar marcas FIPE')
  return res.json()
}

export async function getFipeModels(type: 'motos' | 'carros', brandCode: string) {
  const res = await fetch(`${FIPE_BASE}/${type}/marcas/${brandCode}/modelos`)
  if (!res.ok) throw new Error('Erro ao buscar modelos FIPE')
  return res.json()
}

export async function getFipeYears(type: 'motos' | 'carros', brandCode: string, modelCode: string) {
  const res = await fetch(`${FIPE_BASE}/${type}/marcas/${brandCode}/modelos/${modelCode}/anos`)
  if (!res.ok) throw new Error('Erro ao buscar anos FIPE')
  return res.json()
}

export async function getFipePrice(
  type: 'motos' | 'carros',
  brandCode: string,
  modelCode: string,
  yearCode: string
): Promise<{ Valor: string; Marca: string; Modelo: string; AnoModelo: number }> {
  const res = await fetch(
    `${FIPE_BASE}/${type}/marcas/${brandCode}/modelos/${modelCode}/anos/${yearCode}`
  )
  if (!res.ok) throw new Error('Erro ao buscar preço FIPE')
  return res.json()
}

export function parseFipePrice(fipeValor: string): number {
  // "R$ 24.500,00" -> 24500
  return parseFloat(fipeValor.replace('R$', '').replace(/\./g, '').replace(',', '.').trim())
}
