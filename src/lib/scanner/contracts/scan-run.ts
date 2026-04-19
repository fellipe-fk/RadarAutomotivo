export const SCAN_PIPELINE_STAGES = [
  'discovery',
  'normalize',
  'dedupe',
  'persist',
  'enrich',
  'score',
  'match',
  'alert',
] as const

export type ScanPipelineStage = (typeof SCAN_PIPELINE_STAGES)[number]

export const SCAN_RUN_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'] as const

export type ScanRunStatus = (typeof SCAN_RUN_STATUSES)[number]

export interface ScanRunCounters {
  discovered: number
  normalized: number
  deduped: number
  persisted: number
  created: number
  updated: number
  enriched: number
  scored: number
  matched: number
  alerted: number
  failed: number
}

export interface ScanRunDiagnostic {
  stage: ScanPipelineStage
  message: string
  source?: string
  metadata?: Record<string, unknown>
}

export interface ScanRunContract {
  id: string
  userId: string
  radarConfigId?: string | null
  status: ScanRunStatus
  mode?: string | null
  startedAt: Date
  finishedAt?: Date | null
  counters: ScanRunCounters
  diagnostics: ScanRunDiagnostic[]
}
