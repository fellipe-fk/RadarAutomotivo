type ExtractedListing = {
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
}

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

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
  return host.replace(/^www\./, '')
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase()

  if (BLOCKED_HOSTS.has(normalized) || normalized.endsWith('.local')) return true
  if (/^10\./.test(normalized)) return true
  if (/^192\.168\./.test(normalized)) return true
  if (/^169\.254\./.test(normalized)) return true

  const private172 = normalized.match(/^172\.(\d+)\./)
  if (private172) {
    const block = Number(private172[1])
    if (block >= 16 && block <= 31) return true
  }

  return false
}

function assertSafeUrl(sourceUrl: string) {
  let parsed: URL

  try {
    parsed = new URL(sourceUrl)
  } catch {
    throw new Error('O link do anuncio precisa ser uma URL valida.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Use apenas links http ou https na analise.')
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('Nao e permitido analisar links internos ou locais.')
  }

  return parsed
}

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
    .map((match) => match[1]?.trim())
    .filter(Boolean)
    .flatMap((raw) => {
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
    if (typeof image === 'string') {
      images.add(image)
    } else if (Array.isArray(image)) {
      image.filter((entry): entry is string => typeof entry === 'string').forEach((entry) => images.add(entry))
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
  const mileageMatch = rawText.match(/([\d.\s]{1,12})\s*(?:km|quilometr)/i)
  return mileageMatch?.[1] ? toNumber(mileageMatch[1]) : undefined
}

function extractYear(rawText: string) {
  const yearMatches = Array.from(rawText.matchAll(/\b(19\d{2}|20\d{2})\b/g))
    .map((match) => Number(match[1]))
    .filter((value) => value >= 1990 && value <= new Date().getFullYear() + 1)

  return yearMatches[0]
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
  if (localityMeta) {
    return { city: localityMeta }
  }

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
  const cleanTitle = normalizeWhitespace(title)
  const parts = cleanTitle.split(' ').filter(Boolean)

  if (parts.length < 2) {
    return { brand: undefined, model: undefined }
  }

  return {
    brand: parts[0],
    model: parts.slice(1, 3).join(' '),
  }
}

export async function extractListingFromUrl(sourceUrl: string): Promise<ExtractedListing> {
  const parsedUrl = assertSafeUrl(sourceUrl)
  const response = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(12000),
    redirect: 'follow',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Nao consegui abrir o link do anuncio (${response.status}).`)
  }

  const html = await response.text()
  const rawText = stripHtml(html)
  const jsonLdItems = extractJsonLd(html)
  const title = extractTitle(html)
  const description = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description')
  const price = extractPrice(rawText, html, jsonLdItems)
  const mileage = extractMileage(rawText)
  const year = extractYear(`${title} ${rawText}`)
  const { city, state } = extractLocation(html, rawText, jsonLdItems)
  const derived = deriveBrandModel(title)

  return {
    source: detectSource(new URL(response.url || parsedUrl.toString())),
    resolvedUrl: response.url || parsedUrl.toString(),
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
  }
}
