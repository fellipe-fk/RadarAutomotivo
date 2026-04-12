'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { Listing } from '@/types'

type RadarConfig = {
  ativo?: boolean
  scoreAlerta?: number
  riscoMax?: string
}

function safeNumber(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function matchesRadar(listing: Listing, config: RadarConfig | null) {
  if (!config?.ativo) return false

  const scoreAlerta = config.scoreAlerta ?? 75
  const risk = listing.riskLevel || 'MEDIUM'

  if (safeNumber(listing.opportunityScore) < scoreAlerta) return false
  if (config.riscoMax === 'LOW' && risk !== 'LOW') return false
  if (config.riscoMax === 'MEDIUM' && risk === 'HIGH') return false

  return true
}

function formatMoney(value: number) {
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`
}

export default function AnalyticsPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [config, setConfig] = useState<RadarConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true)

      try {
        const [listingsResponse, alertsResponse] = await Promise.all([
          fetch('/api/listings?status=ANALYZED'),
          fetch('/api/alerts'),
        ])

        const listingsData = await listingsResponse.json()
        const alertsData = await alertsResponse.json()

        setListings(listingsData.listings || [])
        setConfig(alertsData.config || null)
      } catch (error) {
        console.error(error)
        setListings([])
        setConfig(null)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [])

  const analytics = useMemo(() => {
    const radarListings = listings.filter((listing) => matchesRadar(listing, config))
    const totalMargin = radarListings.reduce((total, listing) => total + safeNumber(listing.estimatedMargin), 0)
    const avgMargin = radarListings.length > 0 ? totalMargin / radarListings.length : 0
    const opportunityRate = listings.length > 0 ? Math.round((radarListings.length / listings.length) * 100) : 0

    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      const label = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
      const key = date.toISOString().slice(0, 10)
      const value = listings.filter((listing) => listing.createdAt.slice(0, 10) === key).length
      return { label, value }
    })

    const sourceCounts = listings.reduce<Record<string, number>>((acc, listing) => {
      const source = listing.source.toUpperCase()
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {})

    const modelCounts = listings.reduce<Record<string, number>>((acc, listing) => {
      const model = listing.model || listing.title.split(' ').slice(0, 2).join(' ')
      acc[model] = (acc[model] || 0) + 1
      return acc
    }, {})

    return {
      radarListings,
      totalMargin,
      avgMargin,
      opportunityRate,
      days,
      sources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 4),
      models: Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).slice(0, 4),
    }
  }, [config, listings])

  const peakValue = Math.max(...analytics.days.map((day) => day.value), 1)

  return (
    <div className="app-layout" data-page-id="analytics">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">Performance do radar e historico de revenda.</p>
          </div>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <div className="label">Total analisados</div>
            <div className="value">{listings.length}</div>
            <div className="sub">historico atual</div>
          </article>

          <article className="metric-card">
            <div className="label">Taxa de oportunidade</div>
            <div className="value">{analytics.opportunityRate}%</div>
            <div className="sub">passaram no radar</div>
          </article>

          <article className="metric-card">
            <div className="label">Margem total identificada</div>
            <div className="value">{formatMoney(analytics.totalMargin)}</div>
            <div className="sub">somando o radar atual</div>
          </article>

          <article className="metric-card">
            <div className="label">Margem media</div>
            <div className="value">{formatMoney(analytics.avgMargin)}</div>
            <div className="sub">por oportunidade forte</div>
          </article>
        </div>

        <div className="analytics-grid">
          <section className="analytics-card">
            <div className="card-title">Scans por dia</div>
            <div className="bar-chart">
              {analytics.days.map((day) => (
                <div
                  key={day.label}
                  className="bar-col"
                  style={{
                    height: `${Math.max(8, Math.round((day.value / peakValue) * 100))}%`,
                    background: day.value === peakValue ? '#185fa5' : '#e6f1fb',
                  }}
                />
              ))}
            </div>
            <div className="analytics-labels">
              {analytics.days.map((day) => (
                <span key={day.label}>{day.label}</span>
              ))}
            </div>
          </section>

          <section className="analytics-card">
            <div className="card-title">Distribuicao por canal</div>
            <div className="stack">
              {analytics.sources.map(([source, count]) => (
                <div key={source} className="integration-row">
                  <strong>{source}</strong>
                  <span className="badge">{count}</span>
                </div>
              ))}
              {!analytics.sources.length ? <div className="section-title__hint">Sem dados suficientes ainda.</div> : null}
            </div>
          </section>

          <section className="analytics-card">
            <div className="card-title">Modelos mais frequentes</div>
            <div className="stack">
              {analytics.models.map(([model, count]) => (
                <div key={model} className="integration-row">
                  <strong>{model}</strong>
                  <span className="section-title__hint">{count} anuncios</span>
                </div>
              ))}
              {!analytics.models.length ? <div className="section-title__hint">Sem dados suficientes ainda.</div> : null}
            </div>
          </section>
        </div>

        <section className="card">
          <div className="system-card__head">
            <h2 className="section-title">Resumo executivo</h2>
            <span className="section-title__hint">Leituras automaticas da base atual</span>
          </div>

          <div className="stack">
            <div className="mini-card">
              <strong>Volume de oportunidade</strong>
              <p>{analytics.radarListings.length} anuncios estao acima da linha do radar neste momento.</p>
            </div>
            <div className="mini-card">
              <strong>Canal dominante</strong>
              <p>
                {analytics.sources[0]
                  ? `${analytics.sources[0][0]} esta gerando o maior volume de anuncios monitorados.`
                  : 'Ainda nao ha volume suficiente para apontar um canal dominante.'}
              </p>
            </div>
          </div>
        </section>

        {loading ? <div className="dashboard-card__empty">Carregando analytics...</div> : null}
      </main>
    </div>
  )
}
