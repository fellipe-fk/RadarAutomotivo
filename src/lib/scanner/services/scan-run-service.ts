import type { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'

import { prisma } from '@/lib/prisma'
import type {
  ScanPipelineStage,
  ScanRunContract,
  ScanRunCounters,
  ScanRunDiagnostic,
  ScanRunStatus,
} from '../contracts/scan-run'

const EMPTY_COUNTERS: ScanRunCounters = {
  discovered: 0,
  normalized: 0,
  deduped: 0,
  persisted: 0,
  created: 0,
  updated: 0,
  enriched: 0,
  scored: 0,
  matched: 0,
  alerted: 0,
  failed: 0,
}

export interface CreateScanRunInput {
  userId: string
  radarConfigId?: string | null
  mode?: string | null
}

export interface ScanSourceRunSummary {
  source: string
  found: number
  imported: number
  updated: number
  failed: number
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  errorMsg?: string
  diagnostics: Array<Record<string, unknown>>
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
}

export function createScanRun(input: CreateScanRunInput): ScanRunContract {
  return {
    id: randomUUID(),
    userId: input.userId,
    radarConfigId: input.radarConfigId || null,
    status: 'QUEUED',
    mode: input.mode || null,
    startedAt: new Date(),
    finishedAt: null,
    counters: { ...EMPTY_COUNTERS },
    diagnostics: [],
  }
}

export function updateScanRunStatus(run: ScanRunContract, status: ScanRunStatus): ScanRunContract {
  return {
    ...run,
    status,
  }
}

export function addScanRunCounter(run: ScanRunContract, counter: keyof ScanRunCounters, amount = 1): ScanRunContract {
  return {
    ...run,
    counters: {
      ...run.counters,
      [counter]: run.counters[counter] + amount,
    },
  }
}

export function mergeScanRunCounters(run: ScanRunContract, counters: Partial<ScanRunCounters>): ScanRunContract {
  return {
    ...run,
    counters: {
      discovered: run.counters.discovered + (counters.discovered || 0),
      normalized: run.counters.normalized + (counters.normalized || 0),
      deduped: run.counters.deduped + (counters.deduped || 0),
      persisted: run.counters.persisted + (counters.persisted || 0),
      created: run.counters.created + (counters.created || 0),
      updated: run.counters.updated + (counters.updated || 0),
      enriched: run.counters.enriched + (counters.enriched || 0),
      scored: run.counters.scored + (counters.scored || 0),
      matched: run.counters.matched + (counters.matched || 0),
      alerted: run.counters.alerted + (counters.alerted || 0),
      failed: run.counters.failed + (counters.failed || 0),
    },
  }
}

export function addScanRunDiagnostic(
  run: ScanRunContract,
  diagnostic: ScanRunDiagnostic | { stage: ScanPipelineStage; message: string; source?: string; metadata?: Record<string, unknown> }
): ScanRunContract {
  return {
    ...run,
    diagnostics: [...run.diagnostics, diagnostic],
  }
}

export function completeScanRun(run: ScanRunContract, status: Extract<ScanRunStatus, 'COMPLETED' | 'PARTIAL' | 'FAILED'> = 'COMPLETED') {
  return {
    ...run,
    status,
    finishedAt: new Date(),
  }
}

export async function persistScanRunStart(run: ScanRunContract) {
  return prisma.scanRun.create({
    data: {
      id: run.id,
      userId: run.userId,
      radarConfigId: run.radarConfigId || undefined,
      status: run.status,
      mode: run.mode || undefined,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt || undefined,
      totalFound: 0,
      totalNew: 0,
      totalUpdated: 0,
      totalFailed: 0,
      diagnostics: toJsonValue(run.diagnostics),
    },
  })
}

export async function persistScanRunCompletion(run: ScanRunContract) {
  return prisma.scanRun.update({
    where: { id: run.id },
    data: {
      status: run.status,
      finishedAt: run.finishedAt || new Date(),
      totalFound: run.counters.discovered,
      totalNew: run.counters.created,
      totalUpdated: run.counters.updated,
      totalFailed: run.counters.failed,
      diagnostics: toJsonValue(run.diagnostics),
    },
  })
}

export async function replaceScanSourceRuns(scanRunId: string, sourceRuns: ScanSourceRunSummary[]) {
  await prisma.scanSourceRun.deleteMany({
    where: { scanRunId },
  })

  if (sourceRuns.length === 0) return []

  await prisma.scanSourceRun.createMany({
    data: sourceRuns.map((sourceRun) => ({
      scanRunId,
      source: sourceRun.source,
      status: sourceRun.status,
      found: sourceRun.found,
      imported: sourceRun.imported,
      updated: sourceRun.updated,
      failed: sourceRun.failed,
      errorMsg: sourceRun.errorMsg,
      diagnostics: toJsonValue(sourceRun.diagnostics),
      finishedAt: new Date(),
    })),
  })

  return prisma.scanSourceRun.findMany({
    where: { scanRunId },
    orderBy: [{ source: 'asc' }],
  })
}
