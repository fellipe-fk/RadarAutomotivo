'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { DEFAULT_RADAR_CONFIG, matchesRadar, normalizeRadarConfig, safeNumber } from '@/lib/radar'
import { Listing } from '@/types'

const sourceOptions = [
  { value: 'olx', label: 'OLX' },
  { value: 'olxpro', label: 'OLX Pro' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'webmotors', label: 'Webmotors' },
  { value: 'icarros', label: 'iCarros' },
  { value: 'mercadolivre', label: 'Mercado Livre' },
  { value: 'kavak', label: 'Kavak' },
  { value: 'queroquero', label: 'Quero-Quero' },
  { value: 'manual', label: 'Manual' },
]

const CAR_ONLY_SOURCES = new Set(['webmotors', 'icarros', 'kavak', 'queroquero'])
const PARTIAL_AUTOMATION_SOURCES = new Set(['facebook', 'manual', 'queroquero'])

type RadarRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'

type RadarSourceRun = {
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
  status: RadarRunStatus
  mode?: string | null
  startedAt: string
  finishedAt?: string | null
  totalFound: number
  totalNew: number
  totalUpdated: number
  totalFailed: number
  sourceRuns: RadarSourceRun[]
}

type RadarSourceHealth = {
  source: string
  totalRuns: number
  completed: number
  partial: number
  failed: number
  successRate: number
  avgFound: number
  lastFinishedAt?: string | null
}

type RadarSnapshot = {
  id: string
  capturedAt: string
  price?: number | null
  title?: string | null
  city?: string | null
  state?: string | null
  opportunityScore?: number | null
  riskScore?: number | null
  status?: string | null
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

function formatRelativeTime(value?: string | Date | null) {
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

function formatDateTime(value?: string | Date | null) {
  if (!value) return 'Nao agendado'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nao agendado'

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  if (value === 'kavak') return 'Kavak'
  if (value === 'queroquero') return 'Quero-Quero'
  return value.toUpperCase()
}

function getSourceDiagnosticSummary(diagnostics?: Array<Record<string, unknown>>) {
  const first = diagnostics?.[0]
  if (!first) return null

  const detail = typeof first.detail === 'string' ? first.detail : null
  if (detail) return detail

  if (first.unsupportedForType && typeof first.unsupportedForType === 'string') {
    return `Fonte ignorada para tipo ${first.unsupportedForType.toLowerCase()}.`
  }

  if (typeof first.searchUrl === 'string' && typeof first.found === 'number') {
    return first.found > 0 ? `Descoberta via ${first.searchUrl}.` : `Busca executada sem links validos em ${first.searchUrl}.`
  }

  return null
}

function summarizeSourceRun(sourceRun: RadarSourceRun) {
  const diagnostic = getSourceDiagnosticSummary(sourceRun.diagnostics)

  if (diagnostic) {
    return `${formatSourceLabel(sourceRun.source)} | ${diagnostic}`
  }

  if (sourceRun.imported > 0 || sourceRun.updated > 0) {
    return `${formatSourceLabel(sourceRun.source)} | ${sourceRun.imported} novos | ${sourceRun.updated} atualizados`
  }

  if (sourceRun.found > 0 && sourceRun.failed === 0) {
    return `${formatSourceLabel(sourceRun.source)} | ${sourceRun.found} links encontrados aguardando processamento`
  }

  if (sourceRun.failed > 0) {
    return `${formatSourceLabel(sourceRun.source)} | ${sourceRun.failed} falha(s) no processamento`
  }

  return `${formatSourceLabel(sourceRun.source)} | sem atividade relevante nesta rodada`
}

export default function RadarPage() {
  const [config, setConfig] = useState<typeof DEFAULT_RADAR_CONFIG>(DEFAULT_RADAR_CONFIG)
  const [listings, setListings] = useState<Listing[]>([])
  const [newModel, setNewModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runningScan, setRunningScan] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [scanHistory, setScanHistory] = useState<Array<{ id: string; className: string; text: string }>>([])
  const [scanRuns, setScanRuns] = useState<RadarRun[]>([])
  const [sourceHealth, setSourceHealth] = useState<RadarSourceHealth[]>([])
  const [snapshots, setSnapshots] = useState<RadarSnapshot[]>([])
  const [runTotals, setRunTotals] = useState({
    totalRuns: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    avgFound: 0,
    avgNew: 0,
    avgUpdated: 0,
  })

  async function fetchRadarData() {
    setLoading(true)

    try {
      const [configResponse, listingsResponse, runsResponse, snapshotsResponse] = await Promise.all([
        fetch('/api/alerts'),
        fetch('/api/listings?status=ANALYZED'),
        fetch('/api/radar/runs?limit=6'),
        fetch('/api/radar/listings?limit=6'),
      ])

      const configData = await configResponse.json()
      const listingsData = await listingsResponse.json()
      const runsData = await runsResponse.json()
      const snapshotsData = await snapshotsResponse.json()

      const normalizedConfig = normalizeRadarConfig(configData.config)
      setConfig(normalizedConfig)
      setListings(listingsData.listings || [])
      setScanRuns(runsData.runs || [])
      setSourceHealth(runsData.health?.sourceHealth || [])
      setRunTotals(
        runsData.health?.totals || {
          totalRuns: 0,
          completed: 0,
          partial: 0,
          failed: 0,
          avgFound: 0,
          avgNew: 0,
          avgUpdated: 0,
        }
      )
      setSnapshots(snapshotsData.snapshots || [])

      setScanHistory((listingsData.listings || []).slice(0, 8).map((listing: Listing) => {
        const passed = matchesRadar(listing, normalizedConfig)

        if (passed) {
          return {
            id: listing.id,
            className: 'scan-log__line scan-log__line--ok',
            text: `${listing.title} | score ${safeNumber(listing.opportunityScore)} | encontrado no radar`,
          }
        }

        return {
          id: listing.id,
          className: 'scan-log__line scan-log__line--skip',
          text: `${listing.title} | nao atende aos filtros atuais`,
        }
      }))
    } catch (error) {
      console.error(error)
      setFeedback('Nao foi possivel carregar o radar agora.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRadarData()
  }, [])

  const radarListings = useMemo(() => listings.filter((listing) => matchesRadar(listing, config)), [config, listings])
  const latestScanAt = useMemo(() => config.lastScanAt || scanRuns[0]?.startedAt || listings[0]?.createdAt || null, [config.lastScanAt, scanRuns, listings])
  const nextScanAt = useMemo(() => config.nextScanAt || null, [config.nextScanAt])
  const latestRun = useMemo(() => scanRuns[0] || null, [scanRuns])
  const scanLog = useMemo(() => scanHistory, [scanHistory])
  const ignoredSourcesForType = useMemo(() => {
    if (config.tipo !== 'MOTO') return []
    return config.fontes.filter((source) => CAR_ONLY_SOURCES.has(source))
  }, [config.fontes, config.tipo])
  const partialAutomationSources = useMemo(
    () => config.fontes.filter((source) => PARTIAL_AUTOMATION_SOURCES.has(source)),
    [config.fontes]
  )

  function updateConfigField(field: keyof typeof DEFAULT_RADAR_CONFIG, value: string | number | boolean | string[] | null) {
    setConfig((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function toggleSource(source: string) {
    const enabled = config.fontes.includes(source)
    updateConfigField('fontes', enabled ? config.fontes.filter((item) => item !== source) : [...config.fontes, source])
  }

  function addModel() {
    const value = newModel.trim()

    if (!value || config.modelos.includes(value)) return

    updateConfigField('modelos', [...config.modelos, value])
    setNewModel('')
  }

  function removeModel(model: string) {
    updateConfigField('modelos', config.modelos.filter((item) => item !== model))
  }

  async function saveConfig(nextConfig = config) {
    setSaving(true)
    setFeedback('')

    try {
      const response = await fetch('/api/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao salvar configuracao.')
      }

      setConfig(normalizeRadarConfig(data.config || nextConfig))
      setFeedback('Configuracao do radar salva.')
      await fetchRadarData()
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar configuracao.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleRadar() {
    const nextConfig = { ...config, ativo: !config.ativo }
    setConfig(nextConfig)
    await saveConfig(nextConfig)
  }

  async function runScan() {
    setRunningScan(true)
    setFeedback('')

    try {
      const response = await fetch('/api/radar/scan', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao rodar o scan real.')
      }

      await fetchRadarData()
      const modeLabel =
        data.summary?.mode === 'search' ? 'busca automatica' : data.summary?.mode === 'mixed' ? 'busca + URLs' : 'URLs manuais'
      const sourceRunHistory = (data.sourceRuns || []).map((sourceRun: RadarSourceRun) => ({
        id: `${data.scanRunId}-${sourceRun.source}`,
        className:
          sourceRun.status === 'FAILED'
            ? 'scan-log__line scan-log__line--skip'
            : sourceRun.status === 'PARTIAL'
              ? 'scan-log__line scan-log__line--skip'
              : 'scan-log__line scan-log__line--ok',
        text: summarizeSourceRun(sourceRun),
      }))
      const itemHistory = (data.items || []).slice(0, 8).map((item: { url: string; title?: string; status: string; detail: string }) => ({
        id: `${item.url}-${item.status}`,
        className: item.status === 'skipped' ? 'scan-log__line scan-log__line--skip' : 'scan-log__line scan-log__line--ok',
        text: `${item.title || item.url} | ${item.detail}`,
      }))

      setScanHistory(
        [...sourceRunHistory, ...itemHistory].slice(0, 12)
      )
      const sourceSummary = (data.sourceRuns || [])
        .map((sourceRun: RadarSourceRun) => `${formatSourceLabel(sourceRun.source)} ${sourceRun.imported}/${sourceRun.found}`)
        .join(' | ')
      setFeedback(
        `Scan ${data.scanRunId} concluido via ${modeLabel}: ${data.summary.analyzed} analisados, ${data.summary.created} novos, ${data.summary.updated} atualizados e ${data.summary.alerted} alertas enviados. ${sourceSummary}`
      )
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao rodar o scan real.')
    } finally {
      setRunningScan(false)
    }
  }

  return (
    <div className="app-layout" data-page-id="radar">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Radar de busca</h1>
            <p className="page-subtitle">Defina criterios, acompanhe a saude do scanner e valide as fontes em producao.</p>
          </div>

          <button className="btn" onClick={toggleRadar}>
            {config.ativo ? 'Pausar radar' : 'Ativar radar'}
          </button>
        </div>

        <div className={`radar-status ${config.ativo ? 'on' : 'off'}`}>
          <div className={`rdot ${config.ativo ? 'on' : 'off'}`} />
          <div>
            <strong>{config.ativo ? 'Radar ativo' : 'Radar pausado'}</strong> - {config.modelos.length} modelos monitorados - {config.fontes.length}{' '}
            fontes - ultimo scan {formatRelativeTime(latestScanAt)} - <strong>{radarListings.length} oportunidades</strong> ativas
            <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.75 }}>
              {config.autoScanEnabled ? `proximo scan ${formatDateTime(nextScanAt)}` : 'auto scan desativado'}
            </span>
          </div>
        </div>

        <section className="card">
          <div className="card-title">Saude do scanner</div>
          <div className="radar-config-grid">
            <div className="radar-config-item">
              <label>Ultimo run</label>
              <div style={{ fontWeight: 700 }}>{latestRun ? formatRunStatus(latestRun.status) : 'Sem execucao'}</div>
              <div className="section-title__hint">{latestRun ? formatDateTime(latestRun.startedAt) : 'Nenhum run ainda'}</div>
            </div>

            <div className="radar-config-item">
              <label>Runs recentes</label>
              <div style={{ fontWeight: 700 }}>{runTotals.totalRuns}</div>
              <div className="section-title__hint">
                {runTotals.completed} concluidos, {runTotals.partial} parciais, {runTotals.failed} falhos
              </div>
            </div>

            <div className="radar-config-item">
              <label>Media encontrada</label>
              <div style={{ fontWeight: 700 }}>{runTotals.avgFound}</div>
              <div className="section-title__hint">media de itens descobertos por run</div>
            </div>

            <div className="radar-config-item">
              <label>Media importada</label>
              <div style={{ fontWeight: 700 }}>{runTotals.avgNew}</div>
              <div className="section-title__hint">novos anuncios por run</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {sourceHealth.length === 0 && !loading ? <div className="panel-muted">Sem dados por fonte ainda.</div> : null}
            {sourceHealth.map((source) => (
              <div key={source.source} className="panel-muted" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{formatSourceLabel(source.source)}</strong>
                  <span style={{ color: source.successRate >= 80 ? '#1f8f4e' : source.successRate >= 50 ? '#b7791f' : '#c53030' }}>
                    {source.successRate}%
                  </span>
                </div>
                <div className="section-title__hint" style={{ marginTop: 6 }}>
                  {source.completed} ok, {source.partial} parcial, {source.failed} falha
                </div>
                <div className="section-title__hint">media {source.avgFound} encontrados</div>
                <div className="section-title__hint">ultima execucao {formatRelativeTime(source.lastFinishedAt)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Fontes monitoradas</div>
          <div className="sources-grid">
            {sourceOptions.map((source) => (
              <button
                key={source.value}
                type="button"
                className={`source-item ${config.fontes.includes(source.value) ? 'on' : ''}`}
                onClick={() => toggleSource(source.value)}
              >
                <span className="source-dot" />
                <span>{source.label}</span>
              </button>
            ))}
          </div>
          <div className="section-title__hint">Selecione quais plataformas o radar deve monitorar.</div>
          {ignoredSourcesForType.length > 0 ? (
            <div className="section-title__hint" style={{ marginTop: 8 }}>
              No modo moto, {ignoredSourcesForType.map(formatSourceLabel).join(', ')} ficam apenas como apoio parcial e podem ser ignoradas no scan automatico.
            </div>
          ) : null}
          {partialAutomationSources.length > 0 ? (
            <div className="section-title__hint" style={{ marginTop: 8 }}>
              Fontes com automacao parcial nesta fase: {partialAutomationSources.map(formatSourceLabel).join(', ')}.
            </div>
          ) : null}
        </section>

        <section className="card">
          <div className="card-title">Modelos monitorados</div>
          <div className="tag-list" style={{ marginBottom: 12 }}>
            {config.modelos.map((model) => (
              <button key={model} type="button" className="model-tag" onClick={() => removeModel(model)}>
                {model} x
              </button>
            ))}
          </div>

          <div className="page-header__actions">
            <input
              type="text"
              value={newModel}
              onChange={(event) => setNewModel(event.target.value)}
              placeholder="Ex: Civic, XRE 300, Titan 160"
              style={{ maxWidth: 280 }}
            />
            <button type="button" className="btn" onClick={addModel}>
              + Adicionar
            </button>
          </div>
          <div className="section-title__hint" style={{ marginTop: 8 }}>
            So entram em Oportunidades se o modelo estiver nesta lista.
          </div>
        </section>

        <section className="card">
          <div className="card-title">Criterios de filtragem</div>
          <div className="radar-config-grid">
            <div className="radar-config-item">
              <label>Tipo</label>
              <select value={config.tipo} onChange={(event) => updateConfigField('tipo', event.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="MOTO">Moto</option>
                <option value="CARRO">Carro</option>
              </select>
            </div>

            <div className="radar-config-item">
              <label>Preco maximo (R$)</label>
              <input type="number" value={config.precoMax} onChange={(event) => updateConfigField('precoMax', Number(event.target.value))} />
            </div>

            <div className="radar-config-item">
              <label>Km maxima</label>
              <input type="number" value={config.kmMax} onChange={(event) => updateConfigField('kmMax', Number(event.target.value))} />
            </div>

            <div className="radar-config-item">
              <label>Raio maximo (km)</label>
              <input
                type="number"
                value={config.distanciaMax}
                onChange={(event) => updateConfigField('distanciaMax', Number(event.target.value))}
              />
            </div>

            <div className="radar-config-item">
              <label>Score minimo</label>
              <input
                type="number"
                value={config.scoreAlerta}
                onChange={(event) => updateConfigField('scoreAlerta', Number(event.target.value))}
              />
            </div>

            <div className="radar-config-item">
              <label>Risco maximo</label>
              <select value={config.riscoMax} onChange={(event) => updateConfigField('riscoMax', event.target.value)}>
                <option value="BAIXO">Baixo</option>
                <option value="MEDIO">Medio</option>
                <option value="ALTO">Alto</option>
              </select>
            </div>

            <div className="radar-config-item">
              <label>Ano minimo</label>
              <input type="number" value={config.anoMin} onChange={(event) => updateConfigField('anoMin', Number(event.target.value))} />
            </div>

            <div className="radar-config-item">
              <label>Margem minima (R$)</label>
              <input
                type="number"
                value={config.margemMin}
                onChange={(event) => updateConfigField('margemMin', Number(event.target.value))}
              />
            </div>

            <div className="radar-config-item">
              <label>Frequencia do scan</label>
              <select value={config.frequenciaMin} onChange={(event) => updateConfigField('frequenciaMin', Number(event.target.value))}>
                <option value={30}>A cada 30 min</option>
                <option value={60}>A cada 1 hora</option>
                <option value={120}>A cada 2 horas</option>
                <option value={180}>A cada 3 horas</option>
                <option value={240}>A cada 4 horas</option>
              </select>
            </div>

            <div className="radar-config-item">
              <label>Auto scan</label>
              <select
                value={config.autoScanEnabled ? 'on' : 'off'}
                onChange={(event) => updateConfigField('autoScanEnabled', event.target.value === 'on')}
              >
                <option value="on">Ativado</option>
                <option value="off">Desativado</option>
              </select>
            </div>
          </div>

          <div className="panel-muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Com esses filtros: <strong>{radarListings.length}</strong> anuncios apareceriam em Oportunidades agora.
          </div>

          <div className="page-header__actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={() => saveConfig()} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar configuracao'}
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Runs recentes</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {scanRuns.length === 0 && !loading ? <div className="panel-muted">Nenhum run registrado ainda.</div> : null}
            {scanRuns.map((run) => (
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

                <div className="section-title__hint" style={{ marginTop: 8 }}>
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
                      {getSourceDiagnosticSummary(sourceRun.diagnostics) ? (
                        <div className="section-title__hint">{getSourceDiagnosticSummary(sourceRun.diagnostics)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Snapshots recentes</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {snapshots.length === 0 && !loading ? <div className="panel-muted">Nenhum snapshot registrado ainda.</div> : null}
            {snapshots.map((snapshot) => (
              <div key={snapshot.id} className="panel-muted" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{snapshot.title || snapshot.listing.title}</strong>
                  <span>{formatRelativeTime(snapshot.capturedAt)}</span>
                </div>
                <div className="section-title__hint" style={{ marginTop: 6 }}>
                  {formatSourceLabel(snapshot.listing.source)} | score {snapshot.opportunityScore ?? 0} | risco {snapshot.riskScore ?? 0} | status{' '}
                  {snapshot.status || snapshot.listing.status}
                </div>
                <div className="section-title__hint">
                  {snapshot.city || 'Cidade n/i'} {snapshot.state ? `- ${snapshot.state}` : ''} | R$ {(snapshot.price || 0).toLocaleString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Log do ultimo scan</div>
          <div className="scan-log">
            {loading ? <div className="scan-log__line">Carregando...</div> : null}
            {!loading
              ? scanLog.map((item) => (
                  <div key={item.id} className={item.className}>
                    {item.text}
                  </div>
                ))
              : null}
          </div>

          <div className="page-header__actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={runScan} disabled={runningScan}>
              {runningScan ? 'Rodando scan real...' : 'Rodar scan agora'}
            </button>
            {feedback ? <span className="section-title__hint">{feedback}</span> : null}
          </div>
        </section>
      </main>
    </div>
  )
}
