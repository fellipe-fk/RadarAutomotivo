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

function formatRelativeTime(value?: string) {
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

export default function RadarPage() {
  const [config, setConfig] = useState<typeof DEFAULT_RADAR_CONFIG>(DEFAULT_RADAR_CONFIG)
  const [listings, setListings] = useState<Listing[]>([])
  const [newModel, setNewModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runningScan, setRunningScan] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [scanHistory, setScanHistory] = useState<Array<{ id: string; className: string; text: string }>>([])

  async function fetchRadarData() {
    setLoading(true)

    try {
      const [configResponse, listingsResponse] = await Promise.all([
        fetch('/api/alerts'),
        fetch('/api/listings?status=ANALYZED'),
      ])

      const configData = await configResponse.json()
      const listingsData = await listingsResponse.json()

      setConfig(normalizeRadarConfig(configData.config))
      setListings(listingsData.listings || [])
      setScanHistory((listingsData.listings || []).slice(0, 8).map((listing: Listing) => {
        const passed = matchesRadar(listing, normalizeRadarConfig(configData.config))

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
  const latestScanAt = useMemo(() => listings[0]?.createdAt, [listings])

  const scanLog = useMemo(() => scanHistory, [scanHistory])

  function updateConfigField(field: keyof typeof DEFAULT_RADAR_CONFIG, value: string | number | boolean | string[]) {
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
        data.summary?.mode === 'search' ? 'busca automática' : data.summary?.mode === 'mixed' ? 'busca + URLs' : 'URLs manuais'
      setScanHistory(
        (data.items || []).slice(0, 8).map((item: { url: string; title?: string; status: string; detail: string }) => ({
          id: `${item.url}-${item.status}`,
          className: item.status === 'skipped' ? 'scan-log__line scan-log__line--skip' : 'scan-log__line scan-log__line--ok',
          text: `${item.title || item.url} | ${item.detail}`,
        }))
      )
      setFeedback(
        `Scan real concluido via ${modeLabel}: ${data.summary.analyzed} analisados, ${data.summary.created} novos, ${data.summary.updated} atualizados e ${data.summary.alerted} alertas enviados.`
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
            <p className="page-subtitle">Defina seus criterios - o sistema filtra e alerta automaticamente</p>
          </div>

          <button className="btn" onClick={toggleRadar}>
            {config.ativo ? 'Pausar radar' : 'Ativar radar'}
          </button>
        </div>

        <div className={`radar-status ${config.ativo ? 'on' : 'off'}`}>
          <div className={`rdot ${config.ativo ? 'on' : 'off'}`} />
          <div>
            <strong>{config.ativo ? 'Radar ativo' : 'Radar pausado'}</strong> - {config.modelos.length} modelos
            monitorados - {config.fontes.length} fontes - ultimo scan {formatRelativeTime(latestScanAt)} -{' '}
            <strong>{radarListings.length} oportunidades</strong> ativas
            {config.ativo ? (
              <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.75 }}>
                (scan a cada {config.frequenciaMin >= 60 ? `${config.frequenciaMin / 60}h` : `${config.frequenciaMin}min`})
              </span>
            ) : null}
          </div>
        </div>

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
              <input
                type="number"
                value={config.precoMax}
                onChange={(event) => updateConfigField('precoMax', Number(event.target.value))}
              />
            </div>

            <div className="radar-config-item">
              <label>Km maxima</label>
              <input
                type="number"
                value={config.kmMax}
                onChange={(event) => updateConfigField('kmMax', Number(event.target.value))}
              />
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
              <input
                type="number"
                value={config.anoMin}
                onChange={(event) => updateConfigField('anoMin', Number(event.target.value))}
              />
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
              <select
                value={config.frequenciaMin}
                onChange={(event) => updateConfigField('frequenciaMin', Number(event.target.value))}
              >
                <option value={30}>A cada 30 min</option>
                <option value={60}>A cada 1 hora</option>
                <option value={120}>A cada 2 horas</option>
                <option value={240}>A cada 4 horas</option>
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
