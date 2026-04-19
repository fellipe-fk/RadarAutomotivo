'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'

type SourceRun = {
  id: string
  source: string
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  found: number
  imported: number
  updated: number
  failed: number
  startedAt: string
  finishedAt?: string | null
  diagnostics?: Array<Record<string, unknown>>
}

type RadarRun = {
  id: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
  mode?: string | null
  startedAt: string
  finishedAt?: string | null
  totalFound: number
  totalNew: number
  totalUpdated: number
  totalFailed: number
  sourceRuns: SourceRun[]
}

type SourceHealth = {
  source: string
  totalRuns: number
  completed: number
  partial: number
  failed: number
  successRate: number
  avgFound: number
  avgImported: number
  qualificationRate: number
  failRate: number
  lastFinishedAt?: string | null
}

type Snapshot = {
  id: string
  capturedAt: string
  price?: number | null
  title?: string | null
  city?: string | null
  state?: string | null
  year?: number | null
  mileage?: number | null
  opportunityScore?: number | null
  riskScore?: number | null
  status?: string | null
  rawPayload?: {
    sourceContext?: string
    alertEvaluation?: {
      passedRadar?: boolean
      policyAllowed?: boolean
      throttleAllowed?: boolean
      alerted?: boolean
      reason?: string | null
    }
  } | null
  listing: {
    id: string
    title: string
    source: string
    sourceUrl?: string | null
    status: string
  }
  scanRun?: {
    id: string
    status: string
    startedAt: string
    finishedAt?: string | null
    mode?: string | null
  } | null
}

type RunsPayload = {
  runs: RadarRun[]
  health: {
    totals: {
      totalRuns: number
      completed: number
      partial: number
      failed: number
      avgFound: number
      avgNew: number
      avgUpdated: number
    }
    lastRunAt?: string | null
    sourceHealth: SourceHealth[]
  }
  sourceTrends: Array<{
    source: string
    day: string
    totalRuns: number
    found: number
    imported: number
    updated: number
    failed: number
    completed: number
    partial: number
    failedRuns: number
    qualificationRate: number
    failRate: number
  }>
}

type SnapshotsPayload = {
  snapshots: Snapshot[]
  stats: {
    totalSnapshots: number
    linkedToRuns: number
    withOpportunityScore: number
    latestCapturedAt?: string | null
  }
}

type ConnectorHealthItem = {
  source: string
  supportsDirectSearch: boolean
  supportsAuthenticatedSearch: boolean
  supportsManualExtraction: boolean
  ok: boolean
  details?: string
  checkedAt: string
  durationMs: number
  recentRuns: {
    totalRuns: number
    completed: number
    partial: number
    failed: number
    avgFound: number
    lastFinishedAt?: string | null
  }
}

type HealthPayload = {
  checkedAt: string
  scanner: {
    days: number
    totalRuns: number
    completedRuns: number
    partialRuns: number
    failedRuns: number
    runningRuns: number
    avgRunDurationSeconds: number
    lastRunAt?: string | null
  }
  connectors: {
    total: number
    healthy: number
    unhealthy: number
    avgDurationMs: number
    connectors: ConnectorHealthItem[]
  }
  alerts: {
    sentLast24h: number
    failedLast24h: number
    suppressedLast24h: number
    lastSentAt?: string | null
    policy: {
      cooldownMinutes: number
      burstLimit: number
      burstWindowMinutes: number
    }
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Nao disponivel'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nao disponivel'

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'agora'
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'agora'

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
  if (diffMinutes < 60) return `ha ${diffMinutes} min`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `ha ${diffHours} h`

  const diffDays = Math.round(diffHours / 24)
  return `ha ${diffDays} dia${diffDays > 1 ? 's' : ''}`
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}

function formatRunStatus(status?: string | null) {
  if (status === 'COMPLETED') return 'Concluido'
  if (status === 'PARTIAL') return 'Parcial'
  if (status === 'FAILED') return 'Falhou'
  if (status === 'RUNNING') return 'Rodando'
  if (status === 'QUEUED') return 'Na fila'
  return status || 'Desconhecido'
}

function getRunTone(status?: string | null) {
  if (status === 'COMPLETED') return '#1f8f4e'
  if (status === 'PARTIAL') return '#b7791f'
  if (status === 'FAILED') return '#c53030'
  if (status === 'RUNNING') return '#2563eb'
  return '#718096'
}

function formatSourceLabel(value: string) {
  if (value === 'mercadolivre') return 'Mercado Livre'
  if (value === 'webmotors') return 'Webmotors'
  if (value === 'icarros') return 'iCarros'
  if (value === 'queroquero') return 'Quero-Quero'
  return value.toUpperCase()
}

const sourceOptions = [
  { value: '', label: 'Todas as fontes' },
  { value: 'mercadolivre', label: 'Mercado Livre' },
  { value: 'olx', label: 'OLX' },
  { value: 'webmotors', label: 'Webmotors' },
  { value: 'icarros', label: 'iCarros' },
  { value: 'manual', label: 'Manual' },
]

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'COMPLETED', label: 'Concluido' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'FAILED', label: 'Falhou' },
  { value: 'RUNNING', label: 'Rodando' },
]

export default function RadarMonitoramentoPage() {
  const [days, setDays] = useState('7')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [runsData, setRunsData] = useState<RunsPayload | null>(null)
  const [snapshotsData, setSnapshotsData] = useState<SnapshotsPayload | null>(null)
  const [healthData, setHealthData] = useState<HealthPayload | null>(null)
  const [selectedListingId, setSelectedListingId] = useState<string>('')

  async function loadData() {
    setLoading(true)
    setFeedback('')

    try {
      const query = new URLSearchParams({
        limit: '12',
        days,
      })

      if (source) query.set('source', source)
      if (status) query.set('status', status)

      const snapshotQuery = new URLSearchParams({
        limit: selectedListingId ? '20' : '12',
        days,
      })

      if (source) snapshotQuery.set('source', source)
      if (selectedListingId) snapshotQuery.set('listingId', selectedListingId)

      const [runsResponse, snapshotsResponse, healthResponse] = await Promise.all([
        fetch(`/api/radar/runs?${query.toString()}`),
        fetch(`/api/radar/listings?${snapshotQuery.toString()}`),
        fetch(`/api/radar/health?days=${days}`),
      ])

      const runsPayload = await runsResponse.json()
      const snapshotsPayload = await snapshotsResponse.json()
      const healthPayload = await healthResponse.json()

      if (!runsResponse.ok) {
        throw new Error(runsPayload.error || 'Falha ao carregar runs')
      }

      if (!snapshotsResponse.ok) {
        throw new Error(snapshotsPayload.error || 'Falha ao carregar snapshots')
      }

      if (!healthResponse.ok) {
        throw new Error(healthPayload.error || 'Falha ao carregar health do scanner')
      }

      setRunsData(runsPayload)
      setSnapshotsData(snapshotsPayload)
      setHealthData(healthPayload)
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao carregar monitoramento do scanner.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [days, source, status, selectedListingId])

  const snapshotsByListing = useMemo(() => {
    const grouped = new Map<string, Snapshot[]>()

    for (const snapshot of snapshotsData?.snapshots || []) {
      const current = grouped.get(snapshot.listing.id) || []
      current.push(snapshot)
      grouped.set(snapshot.listing.id, current)
    }

    return Array.from(grouped.entries())
      .map(([listingId, snapshots]) => ({
        listingId,
        title: snapshots[0]?.listing.title || 'Anuncio',
        source: snapshots[0]?.listing.source || 'manual',
        snapshots: snapshots.sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime()),
      }))
      .sort((left, right) => right.snapshots.length - left.snapshots.length)
  }, [snapshotsData])

  const selectedSnapshots = useMemo(() => {
    if (!selectedListingId) return []
    return snapshotsByListing.find((entry) => entry.listingId === selectedListingId)?.snapshots || []
  }, [selectedListingId, snapshotsByListing])

  const sourceTrendGroups = useMemo(() => {
    const grouped = new Map<string, RunsPayload['sourceTrends']>()

    for (const entry of runsData?.sourceTrends || []) {
      const current = grouped.get(entry.source) || []
      current.push(entry)
      grouped.set(entry.source, current)
    }

    return Array.from(grouped.entries()).map(([sourceName, entries]) => ({
      source: sourceName,
      entries: [...entries].sort((left, right) => right.day.localeCompare(left.day)),
    }))
  }, [runsData])

  const latest = selectedSnapshots[0]
  const previous = selectedSnapshots[1]

  return (
    <div className="app-layout" data-page-id="radar-monitoramento">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Monitoramento do scanner</h1>
            <p className="page-subtitle">Acompanhe runs, falhas por fonte, volume coletado e evolucao dos snapshots.</p>
          </div>

          <div className="page-header__actions">
            <button type="button" className="btn" onClick={() => loadData()} disabled={loading}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        <section className="card">
          <div className="card-title">Filtros</div>
          <div className="radar-config-grid">
            <div className="radar-config-item">
              <label>Periodo</label>
              <select value={days} onChange={(event) => setDays(event.target.value)}>
                <option value="1">Ultimo dia</option>
                <option value="3">Ultimos 3 dias</option>
                <option value="7">Ultimos 7 dias</option>
                <option value="15">Ultimos 15 dias</option>
              </select>
            </div>

            <div className="radar-config-item">
              <label>Fonte</label>
              <select value={source} onChange={(event) => setSource(event.target.value)}>
                {sourceOptions.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="radar-config-item">
              <label>Status do run</label>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {statusOptions.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="radar-config-item">
              <label>Drill-down por anuncio</label>
              <select value={selectedListingId} onChange={(event) => setSelectedListingId(event.target.value)}>
                <option value="">Nenhum selecionado</option>
                {snapshotsByListing.map((entry) => (
                  <option key={entry.listingId} value={entry.listingId}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {feedback ? <div className="section-title__hint" style={{ marginTop: 12 }}>{feedback}</div> : null}
        </section>

        <section className="card">
          <div className="card-title">Resumo operacional</div>
          <div className="radar-config-grid">
            <div className="radar-config-item">
              <label>Runs</label>
              <div style={{ fontWeight: 700 }}>{runsData?.health.totals.totalRuns || 0}</div>
              <div className="section-title__hint">ultimos {days} dia(s)</div>
            </div>
            <div className="radar-config-item">
              <label>Concluidos</label>
              <div style={{ fontWeight: 700 }}>{runsData?.health.totals.completed || 0}</div>
              <div className="section-title__hint">parciais {runsData?.health.totals.partial || 0}</div>
            </div>
            <div className="radar-config-item">
              <label>Falhos</label>
              <div style={{ fontWeight: 700 }}>{runsData?.health.totals.failed || 0}</div>
              <div className="section-title__hint">avg found {runsData?.health.totals.avgFound || 0}</div>
            </div>
            <div className="radar-config-item">
              <label>Snapshots</label>
              <div style={{ fontWeight: 700 }}>{snapshotsData?.stats.totalSnapshots || 0}</div>
              <div className="section-title__hint">ultima captura {formatRelativeTime(snapshotsData?.stats.latestCapturedAt)}</div>
            </div>
            <div className="radar-config-item">
              <label>Duracao media</label>
              <div style={{ fontWeight: 700 }}>{formatDuration(healthData?.scanner.avgRunDurationSeconds || 0)}</div>
              <div className="section-title__hint">ultima execucao {formatRelativeTime(healthData?.scanner.lastRunAt)}</div>
            </div>
            <div className="radar-config-item">
              <label>Alertas 24h</label>
              <div style={{ fontWeight: 700 }}>{healthData?.alerts.sentLast24h || 0}</div>
              <div className="section-title__hint">
                {healthData?.alerts.suppressedLast24h || 0} suprimidos, {healthData?.alerts.failedLast24h || 0} falhos
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Health dos conectores</div>
          <div className="panel-muted" style={{ marginBottom: 14 }}>
            <strong>{healthData?.connectors.healthy || 0}</strong> conectores saudaveis de{' '}
            <strong>{healthData?.connectors.total || 0}</strong>, com media de{' '}
            <strong>{healthData?.connectors.avgDurationMs || 0} ms</strong> por checagem.
            <div className="section-title__hint" style={{ marginTop: 6 }}>
              Politica atual de alertas: cooldown de {healthData?.alerts.policy.cooldownMinutes || 0} min, burst de{' '}
              {healthData?.alerts.policy.burstLimit || 0} alertas em {healthData?.alerts.policy.burstWindowMinutes || 0} min.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {(healthData?.connectors.connectors || []).length === 0 && !loading ? (
              <div className="panel-muted">Sem health checks disponiveis.</div>
            ) : null}

            {(healthData?.connectors.connectors || []).map((connector) => (
              <div key={connector.source} className="panel-muted" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{formatSourceLabel(connector.source)}</strong>
                  <span style={{ color: connector.ok ? '#1f8f4e' : '#c53030', fontWeight: 700 }}>
                    {connector.ok ? 'OK' : 'Falhou'}
                  </span>
                </div>
                <div className="section-title__hint" style={{ marginTop: 6 }}>
                  check em {connector.durationMs} ms | ultimo {formatRelativeTime(connector.checkedAt)}
                </div>
                <div className="section-title__hint">
                  runs {connector.recentRuns.totalRuns} | media {connector.recentRuns.avgFound} encontrados
                </div>
                <div className="section-title__hint">
                  direto {connector.supportsDirectSearch ? 'sim' : 'nao'} | manual {connector.supportsManualExtraction ? 'sim' : 'nao'}
                </div>
                <div className="section-title__hint">
                  {connector.recentRuns.completed} ok, {connector.recentRuns.partial} parcial, {connector.recentRuns.failed} falha
                </div>
                <div className="section-title__hint">
                  {connector.details || 'Conector respondeu sem detalhes adicionais.'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Saude por fonte</div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            {(runsData?.health.sourceHealth || []).length === 0 && !loading ? <div className="panel-muted">Sem execucoes por fonte nesse periodo.</div> : null}
            {(runsData?.health.sourceHealth || []).map((item) => (
              <div key={item.source} className="panel-muted" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{formatSourceLabel(item.source)}</strong>
                  <span style={{ color: item.successRate >= 80 ? '#1f8f4e' : item.successRate >= 50 ? '#b7791f' : '#c53030' }}>
                    {item.successRate}%
                  </span>
                </div>
                <div className="section-title__hint" style={{ marginTop: 6 }}>
                  {item.completed} ok, {item.partial} parcial, {item.failed} falha
                </div>
                <div className="section-title__hint">media {item.avgFound} encontrados | {item.avgImported} importados</div>
                <div className="section-title__hint">
                  aproveitamento {item.qualificationRate}% | falha operacional {item.failRate}%
                </div>
                <div className="section-title__hint">ultimo run {formatRelativeTime(item.lastFinishedAt)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Tendencia por fonte</div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {sourceTrendGroups.length === 0 && !loading ? <div className="panel-muted">Sem tendencia disponivel nesse periodo.</div> : null}
            {sourceTrendGroups.map((group) => (
              <div key={group.source} className="panel-muted" style={{ marginBottom: 0 }}>
                <strong>{formatSourceLabel(group.source)}</strong>
                <div className="section-title__hint" style={{ marginTop: 6 }}>
                  {group.entries.length} ponto(s) de observacao no periodo
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {group.entries.slice(0, 4).map((entry) => (
                    <div key={`${entry.source}-${entry.day}`} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{new Date(`${entry.day}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                        <span>{entry.totalRuns} run(s)</span>
                      </div>
                      <div className="section-title__hint">
                        found {entry.found} | importados {entry.imported} | atualizados {entry.updated}
                      </div>
                      <div className="section-title__hint">
                        aproveitamento {entry.qualificationRate}% | falha operacional {entry.failRate}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Runs detalhados</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {(runsData?.runs || []).length === 0 && !loading ? <div className="panel-muted">Nenhum run encontrado com os filtros atuais.</div> : null}
            {(runsData?.runs || []).map((run) => (
              <div key={run.id} className="panel-muted" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{run.id}</strong>
                    <div className="section-title__hint">
                      {run.mode || 'manual'} | inicio {formatDateTime(run.startedAt)} | fim {formatDateTime(run.finishedAt)}
                    </div>
                  </div>
                  <span style={{ color: getRunTone(run.status), fontWeight: 700 }}>{formatRunStatus(run.status)}</span>
                </div>
                <div className="section-title__hint" style={{ marginTop: 6 }}>
                  encontrados {run.totalFound} | novos {run.totalNew} | atualizados {run.totalUpdated} | falhas {run.totalFailed}
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  {run.sourceRuns.map((sourceRun) => (
                    <div key={sourceRun.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{formatSourceLabel(sourceRun.source)}</strong>
                        <span style={{ color: getRunTone(sourceRun.status), fontWeight: 700 }}>{formatRunStatus(sourceRun.status)}</span>
                      </div>
                      <div className="section-title__hint" style={{ marginTop: 6 }}>
                        found {sourceRun.found} | novos {sourceRun.imported}
                      </div>
                      <div className="section-title__hint">atualizados {sourceRun.updated} | falhas {sourceRun.failed}</div>
                      {sourceRun.diagnostics?.[0] ? (
                        <div className="section-title__hint">
                          diagnostico {JSON.stringify(sourceRun.diagnostics[0]).slice(0, 120)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Snapshots e evolucao</div>
          {selectedListingId && latest ? (
            <div className="panel-muted" style={{ marginBottom: 14 }}>
              <strong>{latest.listing.title}</strong>
              <div className="section-title__hint" style={{ marginTop: 6 }}>
                fonte {formatSourceLabel(latest.listing.source)} | ultima captura {formatDateTime(latest.capturedAt)}
              </div>
              <div className="section-title__hint">
                preco atual R$ {(latest.price || 0).toLocaleString('pt-BR')} | score {latest.opportunityScore ?? 0} | risco {latest.riskScore ?? 0}
              </div>
              {latest.rawPayload?.alertEvaluation ? (
                <div className="section-title__hint">
                  alerta: {latest.rawPayload.alertEvaluation.alerted ? 'enviado' : 'nao enviado'} | motivo{' '}
                  {latest.rawPayload.alertEvaluation.reason || 'sem detalhe'}
                </div>
              ) : null}
              {previous ? (
                <div className="section-title__hint">
                  comparativo: preco anterior R$ {(previous.price || 0).toLocaleString('pt-BR')} | delta R$ {((latest.price || 0) - (previous.price || 0)).toLocaleString('pt-BR')}
                </div>
              ) : (
                <div className="section-title__hint">Ainda nao ha captura anterior para comparar.</div>
              )}
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 12 }}>
            {(snapshotsData?.snapshots || []).length === 0 && !loading ? <div className="panel-muted">Nenhum snapshot encontrado com os filtros atuais.</div> : null}
            {(snapshotsData?.snapshots || []).map((snapshot) => (
              <div key={snapshot.id} className="panel-muted" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{snapshot.title || snapshot.listing.title}</strong>
                  <span>{formatRelativeTime(snapshot.capturedAt)}</span>
                </div>
                <div className="section-title__hint" style={{ marginTop: 6 }}>
                  {formatSourceLabel(snapshot.listing.source)} | score {snapshot.opportunityScore ?? 0} | risco {snapshot.riskScore ?? 0} | status {snapshot.status || snapshot.listing.status}
                </div>
                <div className="section-title__hint">
                  {snapshot.city || 'Cidade n/i'} {snapshot.state ? `- ${snapshot.state}` : ''} | R$ {(snapshot.price || 0).toLocaleString('pt-BR')}
                </div>
                {snapshot.rawPayload?.alertEvaluation ? (
                  <div className="section-title__hint">
                    alerta {snapshot.rawPayload.alertEvaluation.alerted ? 'enviado' : 'retido'} |{' '}
                    {snapshot.rawPayload.alertEvaluation.reason || 'sem motivo'}
                  </div>
                ) : null}
                {snapshot.scanRun ? (
                  <div className="section-title__hint">run {snapshot.scanRun.id} | {formatRunStatus(snapshot.scanRun.status)}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
