'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/ui/Sidebar'
import ListingCard from '@/components/listings/ListingCard'
import { matchesRadar as listingMatchesRadar, safeNumber } from '@/lib/radar'
import { Listing } from '@/types'

type RadarConfig = {
  ativo: boolean
  scoreAlerta?: number
  riscoMax?: 'LOW' | 'MEDIUM' | 'HIGH' | string
}

function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function formatRelativeTime(value?: string) {
  if (!value) return 'sem scans ainda'

  const timestamp = new Date(value).getTime()

  if (Number.isNaN(timestamp)) return 'agora'

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))

  if (diffMinutes < 60) return `ha ${diffMinutes} min`

  const diffHours = Math.round(diffMinutes / 60)

  if (diffHours < 24) return `ha ${diffHours} h`

  const diffDays = Math.round(diffHours / 24)
  return `ha ${diffDays} dia${diffDays > 1 ? 's' : ''}`
}

export default function DashboardPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [radarConfig, setRadarConfig] = useState<RadarConfig | null>(null)
  const [alertStats, setAlertStats] = useState({ readyCount: 0, sentCount: 0, failedCount: 0 })
  const [crmStats, setCrmStats] = useState({ total: 0, negociando: 0, comprado: 0, profit: 0 })
  const [loading, setLoading] = useState(true)

  async function fetchDashboardData() {
    setLoading(true)

    try {
      const [listingsResponse, alertsResponse, crmResponse] = await Promise.all([
        fetch('/api/listings?status=ANALYZED'),
        fetch('/api/alerts'),
        fetch('/api/crm'),
      ])

      const listingsData = await listingsResponse.json()
      const alertsData = await alertsResponse.json()
      const crmData = await crmResponse.json()

      setListings(listingsData.listings || [])
      setRadarConfig(alertsData.config || null)
      setAlertStats(alertsData.stats || { readyCount: 0, sentCount: 0, failedCount: 0 })
      setCrmStats(crmData.stats || { total: 0, negociando: 0, comprado: 0, profit: 0 })
    } catch (error) {
      console.error(error)
      setListings([])
      setRadarConfig(null)
      setAlertStats({ readyCount: 0, sentCount: 0, failedCount: 0 })
      setCrmStats({ total: 0, negociando: 0, comprado: 0, profit: 0 })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function handleFavorite(id: string, value: boolean) {
    await fetch('/api/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isFavorite: value }),
    })

    fetchDashboardData()
  }

  async function handleDiscard(id: string) {
    await fetch('/api/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isDiscarded: true }),
    })

    fetchDashboardData()
  }

  const metrics = useMemo(() => {
    const radarListings = listings.filter((listing) => listingMatchesRadar(listing, radarConfig))
    const avgMargin =
      radarListings.length > 0
        ? radarListings.reduce((acc, listing) => acc + safeNumber(listing.estimatedMargin), 0) / radarListings.length
        : 0

    return {
      radarListings,
      avgMargin,
      latestScanAt: listings[0]?.createdAt,
    }
  }, [listings, radarConfig])

  const visibleListings = metrics.radarListings.length > 0 ? metrics.radarListings.slice(0, 4) : listings.slice(0, 4)

  return (
    <div className="app-layout" data-page-id="dashboard">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">
              {getGreeting()}! Ultimo scan do radar: {formatRelativeTime(metrics.latestScanAt)}
            </p>
          </div>

          <a href="/analisar" className="btn btn-primary">
            + Analisar anuncio
          </a>
        </div>

        <div className="metric-grid dashboard-metric-grid">
          <div className="metric-card">
            <div className="label">Analisados</div>
            <div className="value">{listings.length}</div>
            <div className="sub">total</div>
          </div>

          <div className="metric-card">
            <div className="label">No radar</div>
            <div className="value dashboard-metric-value--primary">{alertStats.readyCount}</div>
            <div className="sub">passaram nos filtros</div>
          </div>

          <div className="metric-card">
            <div className="label">Alertas enviados</div>
            <div className="value">{alertStats.sentCount}</div>
            <div className="sub">{alertStats.failedCount} com falha</div>
          </div>

          <div className="metric-card">
            <div className="label">Portfolio</div>
            <div className={`value ${crmStats.profit > 0 ? 'dashboard-metric-value--success' : ''}`}>
              {crmStats.total}
            </div>
            <div className="sub">
              {crmStats.negociando} negociando | {crmStats.comprado} comprados
            </div>
          </div>
        </div>

        <section className="card dashboard-card">
          <div className="dashboard-card__header">
            <h2 className="card-title">Melhores oportunidades agora</h2>

            <Link href="/oportunidades" prefetch={false} className="dashboard-card__link">
              Ver todas
            </Link>
          </div>

          {loading ? <div className="dashboard-card__empty">Carregando oportunidades...</div> : null}

          {!loading && visibleListings.length === 0 ? (
            <div className="dashboard-card__empty">
              <div className="empty-state__icon">?</div>
              <div>Nenhuma oportunidade no radar ainda.</div>
              <a href="/analisar" className="btn btn-primary" style={{ marginTop: 14 }}>
                Analisar primeiro anuncio
              </a>
            </div>
          ) : null}

          <div className="listing-list">
            {visibleListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onFavorite={handleFavorite} onDiscard={handleDiscard} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
