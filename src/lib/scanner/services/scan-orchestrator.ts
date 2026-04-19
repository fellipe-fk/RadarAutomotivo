import { prisma } from '@/lib/prisma'
import { NotAVehicleError } from '@/lib/listing-extractor'
import { normalizeRadarConfig, type RadarConfigLike } from '@/lib/radar'
import { processDirectResult, processUrl } from '@/lib/radar-auto-scan'
import type { ScanResult } from '@/lib/scan-sources'
import { searchFreeSources } from '@/lib/scan-sources'
import type { ListingSeed } from '../contracts/listing-seed'
import { dedupeNormalizedListings } from '../pipelines/dedupe'
import { normalizeListingSeed } from '../pipelines/normalize'
import {
  addScanRunCounter,
  addScanRunDiagnostic,
  completeScanRun,
  createScanRun,
  mergeScanRunCounters,
  persistScanRunCompletion,
  persistScanRunStart,
  replaceScanSourceRuns,
  type ScanSourceRunSummary,
  updateScanRunStatus,
} from './scan-run-service'
import { buildScheduleAfterRun } from './schedule-service'

type LegacyScanType = 'MOTO' | 'CARRO' | 'TODOS'

type SourceRunAccumulator = {
  source: string
  found: number
  imported: number
  updated: number
  failed: number
  diagnostics: Array<Record<string, unknown>>
  errors: string[]
}

export type ScanItemResult = {
  url: string
  title?: string
  status: 'created' | 'updated' | 'skipped'
  detail: string
  listingId?: string
}

export type ScanSummary = {
  total: number
  created: number
  updated: number
  analyzed: number
  alerted: number
  skipped: number
  mode: 'mixed' | 'search' | 'urls'
}

export type ScanDiagnostic = {
  modelo: string
  fonte: string
  searchUrl: string
  found: number
}

const SCAN_PARTIAL_SOURCES = new Set(['facebook', 'manual', 'queroquero'])

export type ExecuteRadarScanResult = {
  scanRun: ReturnType<typeof createScanRun>
  summary: ScanSummary
  items: ScanItemResult[]
  diagnostics: ScanDiagnostic[]
  sourceRuns: ScanSourceRunSummary[]
  discovery: {
    manualUrls: number
    searchUrls: number
    directResults: number
    modelos: number
    fontes: number
  }
}

export interface ExecuteRadarScanInput {
  userId: string
  radarConfigId?: string | null
  config: RadarConfigLike
  mode?: 'manual' | 'auto'
  includeSearchPageFallback?: boolean
}

const SEARCH_FALLBACK_BLOCKED_SOURCES = [
  'manual',
  'facebook',
  'mercadolivre',
  'mercado livre',
  'olx',
  'olxpro',
  'olx pro',
  'webmotors',
  'icarros',
  'kavak',
  'queroquero',
]

function normalizeSourceName(source: string) {
  const value = source.toLowerCase().trim()

  if (value.includes('webmotors')) return 'webmotors'
  if (value.includes('icarros')) return 'icarros'
  if (value.includes('kavak')) return 'kavak'
  if (value.includes('quero')) return 'queroquero'

  return value
}

function slugifySearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
}

function normalizeComparableUrl(value: string) {
  try {
    const parsed = new URL(value)
    parsed.hash = ''
    parsed.protocol = 'https:'
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase()
    parsed.searchParams.sort()

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    }

    return `${parsed.hostname}${parsed.pathname}${parsed.search ? `?${parsed.searchParams.toString()}` : ''}`
  } catch {
    return value.trim().toLowerCase()
  }
}

function isSearchResultPage(url: URL) {
  const path = url.pathname.toLowerCase()
  const search = url.search.toLowerCase()

  return (
    search.includes('q=') ||
    search.includes('busca=') ||
    search.includes('palavra=') ||
    path.includes('/estoque') ||
    path.includes('/lista') ||
    path.includes('/busca') ||
    path.includes('/seminovos')
  )
}

function isSourceSupportedForType(source: string, scanType: LegacyScanType) {
  if (scanType === 'TODOS') return true
  if (scanType === 'CARRO') return true

  return ['mercadolivre', 'olx', 'olxpro', 'olx pro', 'mercado livre'].includes(source)
}

function getDiscoveredUrlPriority(url: string) {
  const source = inferSourceFromUrl(url)

  if (source === 'mercadolivre') return 1
  if (source === 'olx') return 2
  if (source === 'webmotors') return 3
  if (source === 'icarros') return 4
  if (source === 'kavak') return 5
  return 10
}

function isLikelyListingUrl(candidateUrl: string, searchUrl: string) {
  try {
    const candidate = new URL(candidateUrl)
    const search = new URL(searchUrl)
    const hostname = candidate.hostname.replace(/^www\./, '').toLowerCase()
    const pathname = candidate.pathname.toLowerCase()

    if (normalizeComparableUrl(candidateUrl) === normalizeComparableUrl(searchUrl)) {
      return false
    }

    if (isSearchResultPage(candidate)) {
      return false
    }

    if (!hostname.includes(search.hostname.replace(/^www\./, '').toLowerCase())) {
      return false
    }

    if (hostname.includes('mercadolivre')) {
      return pathname.includes('mlb-')
    }

    if (hostname.includes('olx')) {
      return pathname.includes('/item/') || (/\b\d{7,}\b/.test(pathname) && !pathname.includes('/autos-e-pecas/'))
    }

    if (hostname.includes('webmotors')) {
      return pathname.includes('/comprar/') || pathname.includes('/detalhes/')
    }

    if (hostname.includes('icarros')) {
      return pathname.includes('/comprar/') || pathname.includes('/veiculo/')
    }

    if (hostname.includes('kavak')) {
      return pathname.includes('/comprar/') || /\b\d{5,}\b/.test(pathname)
    }

    if (hostname.includes('queroquero')) {
      return false
    }

    return pathname.split('/').filter(Boolean).length >= 3
  } catch {
    return false
  }
}

function createSourceAccumulator(source: string): SourceRunAccumulator {
  return {
    source,
    found: 0,
    imported: 0,
    updated: 0,
    failed: 0,
    diagnostics: [],
    errors: [],
  }
}

function getOrCreateSourceAccumulator(map: Map<string, SourceRunAccumulator>, source: string) {
  const normalizedSource = source.toLowerCase().trim()
  const current = map.get(normalizedSource)
  if (current) return current

  const created = createSourceAccumulator(normalizedSource)
  map.set(normalizedSource, created)
  return created
}

function buildSearchUrls(modelo: string, fonte: string, scanType: LegacyScanType): string[] {
  const q = encodeURIComponent(modelo)
  const slug = slugifySearchTerm(modelo)

  switch (fonte) {
    case 'mercadolivre':
      return scanType === 'MOTO'
        ? [`https://lista.mercadolivre.com.br/veiculos/motos/${slug}`]
        : [`https://lista.mercadolivre.com.br/veiculos/carros-caminhonetes/${slug}`]
    case 'olx':
      return scanType === 'MOTO'
        ? [`https://www.olx.com.br/autos-e-pecas/motos?q=${q}`]
        : [`https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=${q}`]
    case 'webmotors':
      if (scanType === 'MOTO') return []
      return [`https://www.webmotors.com.br/carros/estoque?busca=${q}`]
    case 'icarros':
      if (scanType === 'MOTO') return []
      return [`https://www.icarros.com.br/ache/lista.jsp?palavra=${q}`]
    case 'kavak':
      if (scanType === 'MOTO') return []
      return [`https://www.kavak.com/br/seminovos/${q}`]
    case 'queroquero':
      return []
    default:
      return []
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, application/json;q=0.9, */*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  })

  if (!response.ok) return ''
  return response.text()
}

function extractUrlsFromContent(content: string, searchUrl: string) {
  const rawMatches = content.match(/https?:\/\/[^\s\)\"\']+/g) || []
  const urls = new Set<string>()

  for (const rawUrl of rawMatches) {
    const cleanedUrl = rawUrl.split(')')[0].trim()

    try {
      if (!isLikelyListingUrl(cleanedUrl, searchUrl)) continue
      urls.add(cleanedUrl)
    } catch {
      continue
    }
  }

  return Array.from(urls)
}

async function extractLinksFromSearchPage(searchUrl: string, modelo: string): Promise<string[]> {
  try {
    const candidates: string[] = []

    const jinaUrl = `https://r.jina.ai/http://${searchUrl.replace(/^https?:\/\//, '')}`
    const jinaText = await fetchText(jinaUrl)

    if (jinaText) {
      candidates.push(...extractUrlsFromContent(jinaText, searchUrl))
    }

    const directText = await fetchText(searchUrl)
    if (directText) {
      candidates.push(...extractUrlsFromContent(directText, searchUrl))
    }

    const modeloNorm = modelo.toLowerCase()
    const filtered = Array.from(new Set(candidates)).filter((url) => {
      const urlLower = url.toLowerCase()
      const firstTerm = modeloNorm.split(' ')[0]

      if (!isLikelyListingUrl(url, searchUrl)) {
        return false
      }

      return /\/\d{5,}/.test(url) || urlLower.includes(firstTerm)
    })

    return filtered.slice(0, 8)
  } catch {
    return []
  }
}

function toScanType(tipo: string): LegacyScanType {
  return tipo === 'MOTO' || tipo === 'CARRO' ? tipo : 'TODOS'
}

function inferVehicleTypeFromText(value?: string | null): 'CAR' | 'MOTORCYCLE' {
  const normalized = (value || '').toLowerCase()
  const motoTokens = ['moto', 'xre', 'cg', 'biz', 'fazer', 'bros', 'hornet', 'pcx', 'nmax', 'cb ', 'titan']
  return motoTokens.some((token) => normalized.includes(token)) ? 'MOTORCYCLE' : 'CAR'
}

function mapScanResultToListingSeed(result: ScanResult, scanType: LegacyScanType): ListingSeed {
  const fallbackVehicleType =
    result.source === 'mercadolivre'
      ? inferVehicleTypeFromText(result.title)
      : scanType === 'MOTO'
        ? 'MOTORCYCLE'
        : 'CAR'

  return {
    source: result.source,
    externalId: null,
    url: result.url,
    title: result.title,
    description: null,
    price: result.price,
    city: result.city,
    state: result.state,
    brand: result.brand,
    model: result.model,
    year: result.year,
    mileage: result.mileage,
    fuel: null,
    transmission: null,
    images: result.imageUrl ? [result.imageUrl] : [],
    sellerName: null,
    sellerType: 'UNKNOWN',
    postedAt: null,
    rawPayload: {
      scanType,
      fallbackVehicleType,
    },
  }
}

function dedupeDirectResults(results: ScanResult[], scanType: LegacyScanType) {
  const normalizedEntries = results.map((result) => {
    const seed = mapScanResultToListingSeed(result, scanType)
    const normalized = normalizeListingSeed(seed, {
      fallbackVehicleType: (seed.rawPayload as { fallbackVehicleType?: 'CAR' | 'MOTORCYCLE' } | null)?.fallbackVehicleType || 'UNKNOWN',
    })

    return {
      result,
      normalized,
    }
  })

  const deduped = dedupeNormalizedListings(normalizedEntries.map((entry) => entry.normalized))
  const allowedHashes = new Set(deduped.uniqueListings.map((entry) => entry.listingHash))
  const duplicateReasonCounts = deduped.duplicates.reduce<Record<string, number>>((accumulator, duplicate) => {
    accumulator[duplicate.reason] = (accumulator[duplicate.reason] || 0) + 1
    return accumulator
  }, {})

  return {
    uniqueResults: normalizedEntries.filter((entry) => allowedHashes.has(entry.normalized.listingHash)).map((entry) => entry.result),
    duplicateCount: deduped.duplicates.length,
    duplicateReasonCounts,
  }
}

function applyProcessedSummary(summary: ScanSummary, processed: { item: ScanItemResult; alerted: boolean }) {
  if (processed.item.status === 'created') summary.created += 1
  else if (processed.item.status === 'updated') summary.updated += 1
  else summary.skipped += 1

  if (processed.item.status !== 'skipped') summary.analyzed += 1
  if (processed.alerted) summary.alerted += 1
}

function inferSourceFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('mercadolivre')) return 'mercadolivre'
    if (hostname.includes('olx')) return 'olx'
    if (hostname.includes('webmotors')) return 'webmotors'
    if (hostname.includes('icarros')) return 'icarros'
    if (hostname.includes('kavak')) return 'kavak'
    if (hostname.includes('queroquero')) return 'queroquero'
  } catch {
    return 'manual'
  }

  return 'manual'
}

function finalizeSourceRuns(sourceStats: Map<string, SourceRunAccumulator>): ScanSourceRunSummary[] {
  return Array.from(sourceStats.values())
    .map((entry) => {
      const ignoredOnly = entry.diagnostics.length > 0 && entry.diagnostics.every((diagnostic) => diagnostic.type === 'ignored')
      const status: ScanSourceRunSummary['status'] =
        ignoredOnly
          ? 'COMPLETED'
          : entry.failed > 0 && entry.imported === 0 && entry.updated === 0
          ? 'FAILED'
          : entry.failed > 0
            ? 'PARTIAL'
            : 'COMPLETED'

      return {
        source: entry.source,
        found: entry.found,
        imported: entry.imported,
        updated: entry.updated,
        failed: entry.failed,
        status,
        errorMsg: entry.errors[0],
        diagnostics: entry.diagnostics,
      }
    })
    .sort((left, right) => left.source.localeCompare(right.source))
}

export async function executeRadarScan(input: ExecuteRadarScanInput): Promise<ExecuteRadarScanResult> {
  let scanRun = createScanRun({
    userId: input.userId,
    radarConfigId: input.radarConfigId,
    mode: input.mode || 'manual',
  })

  scanRun = updateScanRunStatus(scanRun, 'RUNNING')
  await persistScanRunStart(scanRun)

  const normalizedConfig = normalizeRadarConfig(input.config)
  const summary: ScanSummary = {
    total: 0,
    created: 0,
    updated: 0,
    analyzed: 0,
    alerted: 0,
    skipped: 0,
    mode: 'mixed',
  }
  const items: ScanItemResult[] = []
  const diagnostics: ScanDiagnostic[] = []
  const sourceStats = new Map<string, SourceRunAccumulator>()

  const manualUrls = Array.from(new Set((input.config.seedUrls || []).map((url) => url.trim()).filter(Boolean))).slice(0, 20)
  if (manualUrls.length > 0) {
    getOrCreateSourceAccumulator(sourceStats, 'manual').found += manualUrls.length
  }

  const scanType = toScanType(normalizedConfig.tipo)
  const directResultsMap = new Map<string, ScanResult>()
  const discoveredUrls: string[] = []
  let rawDirectCount = 0

  if (normalizedConfig.modelos.length > 0 && normalizedConfig.fontes.length > 0) {
    for (const modelo of normalizedConfig.modelos.slice(0, 3)) {
      const { directResults, linkUrls, sourceDiagnostics } = await searchFreeSources(modelo, scanType, normalizedConfig.fontes)

      rawDirectCount += directResults.length

      for (const result of directResults) {
        directResultsMap.set(result.url, result)
      }

      if (linkUrls.length > 0) {
        discoveredUrls.push(...linkUrls)
      }

      for (const sourceDiagnostic of sourceDiagnostics) {
        diagnostics.push({
          modelo,
          fonte: sourceDiagnostic.source,
          searchUrl: `${sourceDiagnostic.source}:${sourceDiagnostic.strategy}`,
          found: sourceDiagnostic.count,
        })

        const stats = getOrCreateSourceAccumulator(sourceStats, sourceDiagnostic.source)
        stats.found += sourceDiagnostic.count
        stats.diagnostics.push({
          type: sourceDiagnostic.status,
          modelo,
          strategy: sourceDiagnostic.strategy,
          detail: sourceDiagnostic.detail,
          found: sourceDiagnostic.count,
        })

        if (sourceDiagnostic.status === 'ignored' && SCAN_PARTIAL_SOURCES.has(sourceDiagnostic.source)) {
          stats.diagnostics.push({
            type: 'info',
            modelo,
            detail: 'Fonte configurada como parcial na etapa atual do scanner.',
          })
        }
      }

      if (input.includeSearchPageFallback) {
        for (const fonte of normalizedConfig.fontes
          .filter((entry) => !SEARCH_FALLBACK_BLOCKED_SOURCES.includes(entry.toLowerCase()))
          .map(normalizeSourceName)
          .slice(0, 8)) {
          if (!isSourceSupportedForType(fonte, scanType)) {
            const stats = getOrCreateSourceAccumulator(sourceStats, fonte)
            stats.diagnostics.push({
              type: 'ignored',
              modelo,
              unsupportedForType: scanType,
              detail: `Fonte ignorada para tipo ${scanType}.`,
            })
            continue
          }

          for (const searchUrl of buildSearchUrls(modelo, fonte, scanType)) {
            const links = await extractLinksFromSearchPage(searchUrl, modelo)
            discoveredUrls.push(...links)
            diagnostics.push({ modelo, fonte, searchUrl, found: links.length })

            const stats = getOrCreateSourceAccumulator(sourceStats, fonte)
            stats.found += links.length
            stats.diagnostics.push({
              type: links.length > 0 ? 'found' : 'empty',
              modelo,
              searchUrl,
              found: links.length,
              detail: links.length > 0 ? 'Links encontrados via fallback de pagina.' : 'Fallback executado sem links validos.',
            })
          }
        }
      }
    }
  }

  const uniqueDiscoveredUrls = Array.from(new Set(discoveredUrls))
  const dedupedDirect = dedupeDirectResults(Array.from(directResultsMap.values()), scanType)
  const directResults = dedupedDirect.uniqueResults.slice(0, 30)
  const prioritizedUrls = uniqueDiscoveredUrls.sort((left, right) => {
    const priorityDiff = getDiscoveredUrlPriority(left) - getDiscoveredUrlPriority(right)
    if (priorityDiff !== 0) return priorityDiff
    return left.localeCompare(right)
  })
  const allUrls = Array.from(new Set([...manualUrls, ...prioritizedUrls])).slice(0, 30)
  const hasSearchDiscovery = directResults.length > 0 || uniqueDiscoveredUrls.length > 0

  summary.total = directResults.length + allUrls.length
  summary.mode = manualUrls.length > 0 && hasSearchDiscovery ? 'mixed' : hasSearchDiscovery ? 'search' : 'urls'

  scanRun = mergeScanRunCounters(scanRun, {
    discovered: rawDirectCount + discoveredUrls.length + manualUrls.length,
    normalized: rawDirectCount,
    deduped: dedupedDirect.duplicateCount + (discoveredUrls.length - uniqueDiscoveredUrls.length),
  })

  if (dedupedDirect.duplicateCount > 0) {
    const mercadolivreStats = sourceStats.get('mercadolivre')
    if (mercadolivreStats) {
      mercadolivreStats.diagnostics.push({
        type: 'dedupe',
        duplicateCount: dedupedDirect.duplicateCount,
        duplicateReasonCounts: dedupedDirect.duplicateReasonCounts,
      })
    }

    scanRun = addScanRunDiagnostic(scanRun, {
      stage: 'dedupe',
      message: 'Duplicatas detectadas entre resultados diretos.',
      metadata: {
        duplicateReasonCounts: dedupedDirect.duplicateReasonCounts,
      },
    })
  }

  if (summary.total === 0) {
    scanRun = addScanRunDiagnostic(scanRun, {
      stage: 'discovery',
      message: 'Nenhum resultado encontrado para o scan atual.',
      metadata: {
        manualUrls: manualUrls.length,
        fontes: normalizedConfig.fontes.length,
        modelos: normalizedConfig.modelos.length,
      },
    })

    scanRun = completeScanRun(scanRun, 'COMPLETED')
    await persistScanRunCompletion(scanRun)
    const sourceRuns = finalizeSourceRuns(sourceStats)
    await replaceScanSourceRuns(scanRun.id, sourceRuns)

    if (input.radarConfigId) {
      const schedule = buildScheduleAfterRun(input.config, scanRun.finishedAt || new Date())
      await prisma.radarConfig.update({
        where: { id: input.radarConfigId },
        data: schedule,
      })
    }

    return {
      scanRun,
      summary,
      items,
      diagnostics,
      sourceRuns,
      discovery: {
        manualUrls: manualUrls.length,
        searchUrls: uniqueDiscoveredUrls.length,
        directResults: directResults.length,
        modelos: normalizedConfig.modelos.length,
        fontes: normalizedConfig.fontes.length,
      },
    }
  }

  for (const result of directResults) {
    const stats = getOrCreateSourceAccumulator(sourceStats, result.source)

    try {
      const processed = await processDirectResult(
        result,
        input.userId,
        normalizedConfig,
        scanType === 'TODOS' ? 'CARRO' : scanType,
        { scanRunId: scanRun.id }
      )
      items.push(processed.item)
      applyProcessedSummary(summary, processed)

      if (processed.item.status === 'created') {
        stats.imported += 1
        scanRun = addScanRunCounter(scanRun, 'created', 1)
      } else if (processed.item.status === 'updated') {
        stats.updated += 1
        scanRun = addScanRunCounter(scanRun, 'updated', 1)
      }

      if (processed.item.status !== 'skipped') {
        scanRun = mergeScanRunCounters(scanRun, {
          persisted: 1,
          enriched: 1,
          scored: 1,
        })
      }

      if (processed.alerted) {
        scanRun = addScanRunCounter(scanRun, 'alerted', 1)
      }
    } catch (error) {
      summary.skipped += 1
      items.push({
        url: result.url,
        title: result.title,
        status: 'skipped',
        detail: error instanceof Error ? error.message : 'Falha ao processar este item.',
      })

      stats.failed += 1
      stats.errors.push(error instanceof Error ? error.message : 'Falha ao processar resultado direto.')
      scanRun = addScanRunCounter(scanRun, 'failed', 1)
      scanRun = addScanRunDiagnostic(scanRun, {
        stage: 'persist',
        source: result.source,
        message: error instanceof Error ? error.message : 'Falha ao processar resultado direto.',
        metadata: { url: result.url },
      })
    }
  }

  for (const sourceUrl of allUrls) {
    const inferredSource = inferSourceFromUrl(sourceUrl)
    const stats = getOrCreateSourceAccumulator(sourceStats, inferredSource)

    try {
      const processed = await processUrl(sourceUrl, input.userId, normalizedConfig, { scanRunId: scanRun.id })
      items.push(processed.item)
      applyProcessedSummary(summary, processed)

      if (processed.item.status === 'created') {
        stats.imported += 1
        scanRun = addScanRunCounter(scanRun, 'created', 1)
      } else if (processed.item.status === 'updated') {
        stats.updated += 1
        scanRun = addScanRunCounter(scanRun, 'updated', 1)
      }

      if (processed.item.status !== 'skipped') {
        scanRun = mergeScanRunCounters(scanRun, {
          persisted: 1,
          enriched: 1,
          scored: 1,
        })
      }

      if (processed.alerted) {
        scanRun = addScanRunCounter(scanRun, 'alerted', 1)
      }
    } catch (error) {
      summary.skipped += 1

      const detail =
        error instanceof NotAVehicleError
          ? `[Nao e veiculo] ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Falha ao processar esta URL.'

      items.push({ url: sourceUrl, status: 'skipped', detail })

      stats.failed += 1
      stats.errors.push(detail)
      scanRun = addScanRunCounter(scanRun, 'failed', 1)
      scanRun = addScanRunDiagnostic(scanRun, {
        stage: 'persist',
        source: inferredSource,
        message: detail,
        metadata: { url: sourceUrl },
      })
    }
  }

  scanRun = completeScanRun(scanRun, scanRun.counters.failed > 0 ? 'PARTIAL' : 'COMPLETED')
  await persistScanRunCompletion(scanRun)

  const sourceRuns = finalizeSourceRuns(sourceStats)
  await replaceScanSourceRuns(scanRun.id, sourceRuns)

  if (input.radarConfigId) {
    const schedule = buildScheduleAfterRun(input.config, scanRun.finishedAt || new Date())
    await prisma.radarConfig.update({
      where: { id: input.radarConfigId },
      data: schedule,
    })
  }

  return {
    scanRun,
    summary,
    items,
    diagnostics,
    sourceRuns,
    discovery: {
      manualUrls: manualUrls.length,
      searchUrls: uniqueDiscoveredUrls.length,
      directResults: directResults.length,
      modelos: normalizedConfig.modelos.length,
      fontes: normalizedConfig.fontes.length,
    },
  }
}
