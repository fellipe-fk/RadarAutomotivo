'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import ListingCard from '@/components/listings/ListingCard'
import Sidebar from '@/components/ui/Sidebar'
import { DEFAULT_RADAR_CONFIG, formatRiskLabel, formatSourceLabel, matchesRadar, normalizeRadarConfig } from '@/lib/radar'
import { Listing } from '@/types'

export default function OportunidadesPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [config, setConfig] = useState<typeof DEFAULT_RADAR_CONFIG>(DEFAULT_RADAR_CONFIG)
  const [loading, setLoading] = useState(true)

  async function fetchListings() {
    setLoading(true)

    try {
      const [listingsResponse, alertsResponse] = await Promise.all([fetch('/api/listings?status=ANALYZED'), fetch('/api/alerts')])

      const listingsData = await listingsResponse.json()
      const alertsData = await alertsResponse.json()

      setListings(listingsData.listings || [])
      setConfig(normalizeRadarConfig(alertsData.config))
    } catch (error) {
      console.error(error)
      setListings([])
      setConfig(DEFAULT_RADAR_CONFIG)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchListings()
  }, [])

  async function handleFavorite(id: string, value: boolean) {
    await fetch('/api/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isFavorite: value }),
    })

    fetchListings()
  }

  async function handleDiscard(id: string) {
    await fetch('/api/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isDiscarded: true }),
    })

    fetchListings()
  }

  const visibleListings = useMemo(() => listings.filter((listing) => matchesRadar(listing, config)), [config, listings])

  const filterChips = useMemo(() => {
    const chips = [`Score >= ${config.scoreAlerta}`, `Risco <= ${formatRiskLabel(config.riscoMax)}`, `Raio ${config.distanciaMax} km`]

    if (config.tipo !== 'TODOS') chips.unshift(`Tipo: ${config.tipo}`)
    if (config.precoMax > 0) chips.push(`Preco ate R$ ${config.precoMax.toLocaleString('pt-BR')}`)
    if (config.fontes.length > 0) chips.push(`Fontes: ${config.fontes.map(formatSourceLabel).join(', ')}`)

    return chips
  }, [config])

  return (
    <div className="app-layout" data-page-id="oportunidades">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Oportunidades</h1>
            <p className="page-subtitle">Somente anuncios que passaram nos seus filtros do radar</p>
          </div>

          <div className="page-header__actions">
            <Link href="/radar" prefetch={false} className="btn">
              Editar filtros
            </Link>
            <a href="/analisar" className="btn btn-primary">
              + Novo
            </a>
          </div>
        </div>

        <div className="filters-bar">
          {filterChips.map((chip) => (
            <span key={chip} className="filter-chip">
              {chip}
            </span>
          ))}
        </div>

        {loading ? <div className="dashboard-card__empty">Carregando oportunidades...</div> : null}

        {!loading && visibleListings.length === 0 ? (
          <div className="dashboard-card__empty">
            <div className="empty-state__icon">?</div>
            <div style={{ marginBottom: 10 }}>Nenhum anuncio passou nos seus filtros.</div>
            {config.tipo !== 'TODOS' ? (
              <div className="section-title__hint" style={{ marginBottom: 10 }}>
                Seu radar esta filtrando apenas {config.tipo.toLowerCase()}. Se quiser ampliar, altere o tipo para Todos.
              </div>
            ) : null}
            <Link href="/radar" prefetch={false} className="btn btn-primary">
              Ajustar radar
            </Link>
          </div>
        ) : null}

        <div className="listing-list">
          {visibleListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onFavorite={handleFavorite} onDiscard={handleDiscard} />
          ))}
        </div>
      </main>
    </div>
  )
}
