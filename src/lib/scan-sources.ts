export type ScanResult = {
  url: string
  title?: string
  price?: number
  city?: string
  state?: string
  year?: number
  mileage?: number
  imageUrl?: string
  brand?: string
  model?: string
  source: string
}

type MLAttribute = {
  id: string
  value_name?: string | null
}

type MLItem = {
  id: string
  title: string
  price: number
  permalink: string
  thumbnail?: string
  seller_address?: {
    city?: { name?: string }
    state?: { abbreviation?: string }
  }
  attributes?: MLAttribute[]
}

type MLSearchResponse = {
  results?: MLItem[]
}

const ML_CATEGORIES = {
  MOTO: 'MLB1243',
  CARRO: 'MLB1744',
  TODOS: 'MLB1744',
} as const

const OLX_FEEDS = {
  motos: 'https://www.olx.com.br/autos-e-pecas/motos/rss',
  carros: 'https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/rss',
} as const

function parseMLAttribute(attributes: MLAttribute[] | undefined, id: string) {
  const attribute = attributes?.find((entry) => entry.id === id)
  if (!attribute?.value_name) return undefined

  const value = Number(attribute.value_name.replace(/[^\d]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function matchesModel(text: string, modelParts: string[]) {
  const normalized = text.toLowerCase()

  if (modelParts.length === 1) {
    return normalized.includes(modelParts[0])
  }

  const matched = modelParts.filter((part) => part.length > 2 && normalized.includes(part))
  return matched.length >= Math.min(2, modelParts.length)
}

function extractRssItems(xml: string) {
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  const items: Array<{ title: string; link: string; description: string }> = []
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)
    const linkMatch = block.match(/<link>(https?:\/\/[^<]+)<\/link>/)
    const descriptionMatch = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)

    if (titleMatch?.[1] && linkMatch?.[1]) {
      items.push({
        title: titleMatch[1].trim(),
        link: linkMatch[1].trim(),
        description: descriptionMatch?.[1]?.trim() || '',
      })
    }
  }

  return items
}

export async function searchMercadoLivre(
  modelo: string,
  tipo: 'MOTO' | 'CARRO' | 'TODOS' = 'TODOS',
  maxResults = 20
): Promise<ScanResult[]> {
  const categoryId = ML_CATEGORIES[tipo] || ML_CATEGORIES.TODOS
  const url = new URL('https://api.mercadolibre.com/sites/MLB/search')

  url.searchParams.set('q', modelo)
  url.searchParams.set('category', categoryId)
  url.searchParams.set('limit', String(Math.min(maxResults, 50)))
  url.searchParams.set('condition', 'used')
  url.searchParams.set('sort', 'relevance')

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RadarAuto/1.0',
      },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn(`[mercadolivre] busca falhou: ${response.status}`)
      return []
    }

    const data = (await response.json()) as MLSearchResponse

    return (data.results || [])
      .filter((item) => item.price >= 800)
      .map((item) => {
        const parts = item.title.split(' ').filter(Boolean)
        const mileage = parseMLAttribute(item.attributes, 'KILOMETERS')
        const year = parseMLAttribute(item.attributes, 'VEHICLE_YEAR')

        return {
          url: item.permalink,
          title: item.title,
          price: item.price,
          city: item.seller_address?.city?.name || undefined,
          state: item.seller_address?.state?.abbreviation || undefined,
          year: year && year >= 1990 ? year : undefined,
          mileage: mileage && mileage < 1_000_000 ? mileage : undefined,
          imageUrl: item.thumbnail?.replace('-I.jpg', '-O.jpg'),
          brand: parts[0] || undefined,
          model: parts.slice(1, 3).join(' ') || undefined,
          source: 'mercadolivre',
        }
      })
  } catch (error) {
    console.warn('[mercadolivre] erro na busca:', error instanceof Error ? error.message : error)
    return []
  }
}

export async function searchOlxRss(
  modelo: string,
  tipo: 'MOTO' | 'CARRO' | 'TODOS' = 'TODOS',
  maxResults = 10
): Promise<string[]> {
  const feeds =
    tipo === 'MOTO'
      ? [OLX_FEEDS.motos]
      : tipo === 'CARRO'
        ? [OLX_FEEDS.carros]
        : [OLX_FEEDS.motos, OLX_FEEDS.carros]

  const modelParts = modelo.toLowerCase().split(/\s+/).filter((part) => part.length > 1)
  const links: string[] = []

  for (const feed of feeds) {
    try {
      const response = await fetch(feed, {
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml',
          'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)',
        },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      })

      if (!response.ok) continue

      const xml = await response.text()
      const items = extractRssItems(xml)

      for (const item of items) {
        if (matchesModel(`${item.title} ${item.description}`, modelParts)) {
          links.push(item.link)
        }
      }
    } catch (error) {
      console.warn(`[olx-rss] feed falhou: ${feed}`, error instanceof Error ? error.message : error)
    }
  }

  return Array.from(new Set(links)).slice(0, maxResults)
}

export async function searchFreeSources(
  modelo: string,
  tipo: 'MOTO' | 'CARRO' | 'TODOS',
  fontes: string[]
): Promise<{ directResults: ScanResult[]; linkUrls: string[] }> {
  const normalizedSources = fontes.map((entry) => entry.toLowerCase())
  const directResults: ScanResult[] = []
  const linkUrls: string[] = []

  if (normalizedSources.includes('mercadolivre') || normalizedSources.includes('mercado livre')) {
    if (tipo === 'TODOS') {
      const [motos, carros] = await Promise.all([searchMercadoLivre(modelo, 'MOTO'), searchMercadoLivre(modelo, 'CARRO')])
      directResults.push(...motos, ...carros)
    } else {
      directResults.push(...(await searchMercadoLivre(modelo, tipo)))
    }
  }

  if (normalizedSources.includes('olx') || normalizedSources.includes('olxpro') || normalizedSources.includes('olx pro')) {
    linkUrls.push(...(await searchOlxRss(modelo, tipo)))
  }

  if (normalizedSources.includes('facebook')) {
    console.log('[scan] facebook ignorado no scan automatico porque exige login.')
  }

  return {
    directResults,
    linkUrls,
  }
}
