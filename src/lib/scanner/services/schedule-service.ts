type RadarScheduleLike = {
  ativo?: boolean
  autoScanEnabled?: boolean
  frequenciaMin?: number | null
  lastScanAt?: Date | string | null
  nextScanAt?: Date | string | null
}

const ALLOWED_FREQUENCIES = new Set([30, 60, 120, 180, 240])

function toDate(value?: Date | string | null) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function normalizeScanFrequencyMinutes(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 60
  const rounded = Math.round(value)
  return ALLOWED_FREQUENCIES.has(rounded) ? rounded : 60
}

export function isAutoScanEnabled(config?: RadarScheduleLike | null) {
  if (!config) return false
  return config.ativo !== false && config.autoScanEnabled !== false
}

export function calculateNextScanAt(from: Date, frequencyMinutes: number) {
  return new Date(from.getTime() + normalizeScanFrequencyMinutes(frequencyMinutes) * 60_000)
}

export function ensureNextScanAt(config: RadarScheduleLike, now = new Date()) {
  if (!isAutoScanEnabled(config)) return null

  const nextScanAt = toDate(config.nextScanAt)
  if (nextScanAt) return nextScanAt

  const lastScanAt = toDate(config.lastScanAt)
  if (lastScanAt) {
    return calculateNextScanAt(lastScanAt, normalizeScanFrequencyMinutes(config.frequenciaMin))
  }

  return now
}

export function isRadarScanDue(config: RadarScheduleLike, now = new Date()) {
  if (!isAutoScanEnabled(config)) return false

  const nextScanAt = ensureNextScanAt(config, now)
  if (!nextScanAt) return false

  return nextScanAt.getTime() <= now.getTime()
}

export function buildScheduleAfterRun(config: RadarScheduleLike, completedAt = new Date()) {
  const enabled = isAutoScanEnabled(config)
  return {
    lastScanAt: completedAt,
    nextScanAt: enabled ? calculateNextScanAt(completedAt, normalizeScanFrequencyMinutes(config.frequenciaMin)) : null,
  }
}

export function buildScheduleOnConfigSave(config: RadarScheduleLike, now = new Date()) {
  if (!isAutoScanEnabled(config)) {
    return {
      autoScanEnabled: false,
      nextScanAt: null,
    }
  }

  return {
    autoScanEnabled: true,
    nextScanAt: ensureNextScanAt(config, now),
  }
}
