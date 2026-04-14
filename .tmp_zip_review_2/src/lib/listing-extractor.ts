// ─────────────────────────────────────────────────────────────
// listing-extractor.ts
// Extrai dados de anúncios de veículos a partir de URLs.
// Valida se o conteúdo é realmente um veículo (carro ou moto).
// Rejeita com erro claro qualquer coisa que não seja veículo.
// ─────────────────────────────────────────────────────────────

export type ExtractedListing = {
  source: string
  resolvedUrl: string
  title?: string
  description?: string
  price?: number
  mileage?: number
  year?: number
  city?: string
  state?: string
  brand?: string
  model?: string
  imageUrls: string[]
  sourceContext?: string
  detectedVehicleType?: 'MOTO' | 'CARRO' | null
}

// Erro específico para conteúdo que não é veículo
export class NotAVehicleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotAVehicleError'
  }
}

// Tokens que indicam moto
const MOTO_TOKENS = [
  'moto','motocicleta','scooter','ciclomotor',
  'honda','yamaha','kawasaki','suzuki','triumph','ducati','harley','dafra','shineray',
  'xre','xtz','fazer','titan','cg 160','cg 150','biz','bros','nxr',
  'cb 500','cb500','cb 300','cb300','hornet','cbr','pcx','nmax',
  'lander','tenere','crosser','factor','neo','crypton','ybr',
  'ninja','versys','vulcan','africa twin','transalp',
  '125cc','150cc','160cc','250cc','300cc','400cc','500cc','600cc',
]

// Tokens que indicam carro
const CARRO_TOKENS = [
  'carro','automóvel','automovel','sedan','hatch','suv','pickup','picape','furgão','furgao','van','crossover',
  'volkswagen','chevrolet','ford','fiat','toyota','hyundai','renault','nissan','jeep',
  'mitsubishi','peugeot','citroen','mercedes','audi','volvo','kia','mazda','subaru',
  'gol','polo','virtus','t-cross','taos','tiguan',
  'onix','tracker','cruze','s10','montana',
  'ka','ecosport','ranger','bronco',
  'palio','uno','mobi','argo','cronos','pulse','toro','strada',
  'corolla','hilux','yaris','sw4','rav4',
  'hb20','creta','tucson','santa fe',
  'sandero','logan','duster','kwid','captur',
  'versa','kicks','frontier','sentra',
  'compass','renegade','commander',
  'hr-v','cr-v','city','fit','wr-v',
  'airbag','abs','porta-malas','cambio automatico','cambio manual','4x4','tracao',
]

// Tokens que confirmam NÃO ser veículo
const NON_VEHICLE_TOKENS = [
  'smartphone','celular','iphone','samsung galaxy','tablet',
  'notebook','laptop','computador','monitor','impressora',
  'playstation','xbox','nintendo','videogame','console',
  'televisão','televisao','smart tv',
  'apartamento','casa à venda','casa para alugar','terreno','kitnet','aluguel','imóvel','imovel',
  'bicicleta','patinete','triciclo',
  'cachorro','gato','animal de estimação',
  'emprego','vaga de emprego',
  'sofa','cama','guarda-roupa','armário','geladeira','fogão','microondas',
  'barco','lancha','jet ski',
  'avião','aeronave',
]

// Domínios que são exclusivamente de veículos
const VEHICLE_ONLY_DOMAINS = [
  'webmotors.com.br','icarros.com.br','kavak.com',
  'mobiauto.com.br','usadosbr.com.br','carrosnaweb.com.br',
  'seminovos.com.br','motorizado.com.br',
]

// Paths de marketplace que indicam seção de moto ou carro
const MOTO_PATHS = ['/motos/','/moto/','/motocicletas/','categoria=motos','category=motos']
const CARRO_PATHS = ['/carros/','/carro/','/automoveis/','/veiculos/','categoria=carros','category=carros','/pickup/','/suv/']

const BLOCKED_HOSTS = new Set(['localhost','127.0.0.1','0.0.0.0','::1'])

// ── Utilitários ───────────────────────────────────────────────

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function normalizeWhitespace(value: string) {
  return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim()
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumber(value: string) {
  const compact = value.replace(/[^\d,.-]/g, '')
  const normalized =
    compact.includes(',') && compact.includes('.')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.includes(',')
        ? compact.replace(',', '.')
        : compact
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stripHtml(html: string) {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
}

function detectSource(url: URL) {
  const host = url.hostname.toLowerCase()
  if (host.includes('olx')) return 'olx'
  if (host.includes('facebook')) return 'facebook'
  if (host.includes('webmotors')) return 'webmotors'
  if (host.includes('icarros')) return 'icarros'
  if (host.includes('mercadolivre')) return 'mercadolivre'
  if (host.includes('kavak')) return 'kavak'
  if (host.includes('mobiauto')) return 'mobiauto'
  return host.replace(/^www\./, '')
}

function isPrivateHostname(hostname: string) {
  const n = hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(n) || n.endsWith('.local')) return true
  if (/^10\./.test(n)) return true
  if (/^192\.168\./.test(n)) return true
  if (/^169\.254\./.test(n)) return true
  const m = n.match(/^172\.(\d+)\./)
  if (m) {
    const b = Number(m[1])
    if (b >= 16 && b <= 31) return true
  }
  return false
}

function assertSafeUrl(sourceUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    throw new Error('O link do anúncio precisa ser uma URL válida.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Use apenas links http ou https.')
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('Não é permitido analisar links internos ou locais.')
  }
  return parsed
}

// ── Validação de veículo ──────────────────────────────────────

type VehicleCheck =
  | { isVehicle: true; vehicleType: 'MOTO' | 'CARRO' | null; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }
  | { isVehicle: false; reason: string }

function checkIsVehicle(params: {
  url: URL
  title: string
  description: string
  rawText: string
}): VehicleCheck {
  const { url, title, description, rawText } = params
  const host = url.hostname.toLowerCase()
  const path = url.pathname.toLowerCase() + url.search.toLowerCase()

  const normTitle = normalizeText(title)
  const normDesc = normalizeText(description.slice(0, 800))
  const normPath = normalizeText(path)
  const normFull = `${normTitle} ${normDesc}`

  // 1. Domínio exclusivo de veículos → sempre válido
  if (VEHICLE_ONLY_DOMAINS.some(d => host.includes(d))) {
    const motoScore = MOTO_TOKENS.filter(t => normTitle.includes(normalizeText(t))).length
    const carroScore = CARRO_TOKENS.filter(t => normTitle.includes(normalizeText(t))).length
    const vehicleType = motoScore > carroScore ? 'MOTO' : carroScore > 0 ? 'CARRO' : null
    return { isVehicle: true, vehicleType, confidence: 'HIGH' }
  }

  // 2. Token forte de não-veículo detectado no título
  const nonVehicleFound = NON_VEHICLE_TOKENS.find(t => normTitle.includes(normalizeText(t)))
  if (nonVehicleFound) {
    // Só rejeita se não tiver nenhum token de veículo no título
    const hasVehicleInTitle = [...MOTO_TOKENS, ...CARRO_TOKENS]
      .some(t => normTitle.includes(normalizeText(t)))
    if (!hasVehicleInTitle) {
      return {
        isVehicle: false,
        reason:
          'Este link não é de um carro ou moto. O RadarAuto analisa somente anúncios de veículos (carros e motos). ' +
          'Se você quer analisar um veículo, cole o link direto do anúncio.'
      }
    }
  }

  // 3. Pontuar tokens de veículo
  let motoScore = 0
  let carroScore = 0

  for (const token of MOTO_TOKENS) {
    const n = normalizeText(token)
    if (normTitle.includes(n)) motoScore += 3
    else if (normDesc.includes(n)) motoScore += 1
    if (normPath.includes(n)) motoScore += 2
  }

  for (const token of CARRO_TOKENS) {
    const n = normalizeText(token)
    if (normTitle.includes(n)) carroScore += 3
    else if (normDesc.includes(n)) carroScore += 1
    if (normPath.includes(n)) carroScore += 2
  }

  // Bônus por path de marketplace
  if (MOTO_PATHS.some(p => path.includes(p))) motoScore += 10
  if (CARRO_PATHS.some(p => path.includes(p))) carroScore += 10

  // Bônus por termos genéricos de veículo
  const genericTerms = ['km', 'quilometr', 'revisad', 'ipva', 'licenc', 'renavam', 'unico dono', 'segundo dono', 'crlv']
  const genericBonus = Math.min(genericTerms.filter(t => normFull.includes(t)).length * 2, 10)

  const total = motoScore + carroScore + genericBonus

  // 4. Sem nenhum sinal de veículo
  if (total < 3 && motoScore === 0 && carroScore === 0) {
    // Verificar se pelo menos o texto do corpo menciona veículo
    const normRawSlice = normalizeText(rawText.slice(0, 1000))
    const hasInBody = [...MOTO_TOKENS, ...CARRO_TOKENS]
      .some(t => normRawSlice.includes(normalizeText(t)))

    if (!hasInBody) {
      return {
        isVehicle: false,
        reason:
          'Não identifiquei um anúncio de carro ou moto neste link. ' +
          'Verifique se o endereço está correto ou use a opção de preencher manualmente.'
      }
    }
  }

  const vehicleType: 'MOTO' | 'CARRO' | null =
    motoScore > carroScore ? 'MOTO' : carroScore > motoScore ? 'CARRO' : null

  const confidence = total >= 12 ? 'HIGH' : total >= 5 ? 'MEDIUM' : 'LOW'

  return { isVehicle: true, vehicleType, confidence }
}

// ── Extração de dados ─────────────────────────────────────────

function extractMetaContent(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return normalizeWhitespace(match[1])
  }
  return ''
}

function extractTitle(html: string) {
  const metaTitle = extractMetaContent(html, 'og:title')
  if (metaTitle) return metaTitle
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) return normalizeWhitespace(titleMatch[1])
  return ''
}

function extractJsonLd(html: string) {
  const blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
  return blocks
    .map(match => match[1]?.trim())
    .filter(Boolean)
    .flatMap(raw => {
      try {
        const parsed = JSON.parse(decodeHtmlEntities(raw || ''))
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        return []
      }
    })
}

function extractImageUrls(html: string, jsonLdItems: unknown[]) {
  const images = new Set<string>()
  const ogImage = extractMetaContent(html, 'og:image')
  if (ogImage) images.add(ogImage)
  for (const item of jsonLdItems) {
    if (!item || typeof item !== 'object') continue
    const image = (item as { image?: unknown }).image
    if (typeof image === 'string') images.add(image)
    else if (Array.isArray(image)) {
      image.filter((e): e is string => typeof e === 'string').forEach(e => images.add(e))
    }
  }
  return Array.from(images).slice(0, 6)
}

function extractPrice(rawText: string, html: string, jsonLdItems: unknown[]) {
  for (const item of jsonLdItems) {
    if (!item || typeof item !== 'object') continue
    const offers = (item as { offers?: { price?: string | number } | Array<{ price?: string | number }> }).offers
    const entries = Array.isArray(offers) ? offers : offers ? [offers] : []
    for (const offer of entries) {
      const value = offer?.price
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') {
        const parsed = toNumber(value)
        if (parsed) return parsed
      }
    }
  }
  const metaPrice = extractMetaContent(html, 'product:price:amount')
  if (metaPrice) {
    const parsed = toNumber(metaPrice)
    if (parsed) return parsed
  }
  const priceMatch = rawText.match(/R\$\s*([\d.\s]+(?:,\d{2})?)/i)
  if (priceMatch?.[1]) return toNumber(priceMatch[1])
  return undefined
}

function extractMileage(rawText: string) {
  const m = rawText.match(/([\d.\s]{1,12})\s*(?:km|quilometr)/i)
  return m?.[1] ? toNumber(m[1]) : undefined
}

function extractYear(rawText: string) {
  const matches = Array.from(rawText.matchAll(/\b(19\d{2}|20\d{2})\b/g))
    .map(m => Number(m[1]))
    .filter(v => v >= 1990 && v <= new Date().getFullYear() + 1)
  return matches[0]
}

function extractLocation(html: string, rawText: string, jsonLdItems: unknown[]) {
  for (const item of jsonLdItems) {
    if (!item || typeof item !== 'object') continue
    const address = (item as { address?: { addressLocality?: string; addressRegion?: string } }).address
    if (address?.addressLocality || address?.addressRegion) {
      return {
        city: address.addressLocality ? normalizeWhitespace(address.addressLocality) : undefined,
        state: address.addressRegion ? normalizeWhitespace(address.addressRegion) : undefined,
      }
    }
  }
  const localityMeta = extractMetaContent(html, 'og:locality')
  if (localityMeta) return { city: localityMeta, state: undefined }
  const locationMatch = rawText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-/]\s*([A-Z]{2})\b/)
  if (locationMatch) {
    return {
      city: normalizeWhitespace(locationMatch[1]),
      state: normalizeWhitespace(locationMatch[2]),
    }
  }
  return { city: undefined, state: undefined }
}

function deriveBrandModel(title: string) {
  const parts = normalizeWhitespace(title).split(' ').filter(Boolean)
  if (parts.length < 2) return { brand: undefined, model: undefined }
  return { brand: parts[0], model: parts.slice(1, 3).join(' ') }
}

// Tenta extrair via Jina.ai (funciona em OLX, Facebook, etc.)
async function tryExtractViaJina(url: string): Promise<{ html: string; rawText: string; title: string } | null> {
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(18000),
    })
    if (!response.ok) return null
    const data = await response.json() as { data?: { content?: string; title?: string } }
    const content = data.data?.content || ''
    const title = data.data?.title || ''
    return { html: content, rawText: content.slice(0, 4000), title }
  } catch {
    return null
  }
}

// ── Função principal exportada ────────────────────────────────

/**
 * Extrai dados de um anúncio de veículo a partir de uma URL.
 *
 * Lança `NotAVehicleError` se o conteúdo não for carro ou moto.
 * Lança `Error` genérico se não conseguir acessar a página.
 */
export async function extractListingFromUrl(sourceUrl: string): Promise<ExtractedListing> {
  const parsedUrl = assertSafeUrl(sourceUrl)

  let html = ''
  let rawText = ''
  let finalUrl = parsedUrl.toString()

  // Tentativa 1: fetch direto
  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
      cache: 'no-store',
    })
    if (response.ok) {
      html = await response.text()
      rawText = stripHtml(html)
      finalUrl = response.url || parsedUrl.toString()
    }
  } catch {
    // Falhou, tentar Jina.ai
  }

  // Tentativa 2: Jina.ai (gratuito, contorna bot detection)
  if (!rawText || rawText.length < 200) {
    const jinaResult = await tryExtractViaJina(parsedUrl.toString())
    if (jinaResult) {
      html = jinaResult.html
      rawText = jinaResult.rawText
    }
  }

  if (!rawText || rawText.length < 100) {
    throw new Error(
      'Não consegui ler o conteúdo deste link. ' +
      'Tente outro navegador para abrir o link, copie o título e descrição, e use a opção de preencher manualmente.'
    )
  }

  const finalParsedUrl = new URL(finalUrl)
  const jsonLdItems = extractJsonLd(html)
  const title = extractTitle(html) || ''
  const description =
    extractMetaContent(html, 'description') ||
    extractMetaContent(html, 'og:description') ||
    rawText.slice(0, 300)

  // ── VALIDAÇÃO DE VEÍCULO ──────────────────────────────────
  const vehicleCheck = checkIsVehicle({
    url: finalParsedUrl,
    title,
    description,
    rawText,
  })

  if (!vehicleCheck.isVehicle) {
    throw new NotAVehicleError(vehicleCheck.reason)
  }

  // ── EXTRAÇÃO ──────────────────────────────────────────────
  const price = extractPrice(rawText, html, jsonLdItems)
  const mileage = extractMileage(rawText)
  const year = extractYear(`${title} ${rawText}`)
  const { city, state } = extractLocation(html, rawText, jsonLdItems)
  const derived = deriveBrandModel(title)

  return {
    source: detectSource(finalParsedUrl),
    resolvedUrl: finalUrl,
    title: title || undefined,
    description: description || undefined,
    price,
    mileage,
    year,
    city,
    state,
    brand: derived.brand,
    model: derived.model,
    imageUrls: extractImageUrls(html, jsonLdItems),
    sourceContext: normalizeWhitespace(`${title}\n${description}\n${rawText}`.trim()).slice(0, 2400),
    detectedVehicleType: 'vehicleType' in vehicleCheck ? vehicleCheck.vehicleType : null,
  }
}
