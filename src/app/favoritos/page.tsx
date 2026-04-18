'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import ListingCard from '@/components/listings/ListingCard'
import Sidebar from '@/components/ui/Sidebar'
import { Listing } from '@/types'

export default function FavoritosPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  async function fetchFavorites() {
    setLoading(true)

    try {
      const response = await fetch('/api/listings?favorite=true')
      const data = await response.json()
      setListings(data.listings || [])
    } catch (error) {
      console.error(error)
      setListings([])
      setFeedback('Nao foi possivel carregar os favoritos agora.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFavorites()
  }, [])

  async function handleFavorite(id: string, value: boolean) {
    await fetch('/api/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isFavorite: value }),
    })

    fetchFavorites()
  }

  async function handleDiscard(id: string) {
    await fetch('/api/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isDiscarded: true }),
    })

    fetchFavorites()
  }

  async function addToPortfolio(listing: Listing) {
    try {
      const response = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          title: listing.title,
          precoCompra: listing.price,
          status: 'INTERESSE',
          notes: 'Via favoritos',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao adicionar ao portfolio.')
      }

      setFeedback('Anuncio enviado para o portfolio.')
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao adicionar ao portfolio.')
    }
  }

  return (
    <div className="app-layout" data-page-id="favoritos">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Favoritos</h1>
            <p className="page-subtitle">Anuncios salvos para acompanhar com mais calma ou levar para negociacao.</p>
          </div>

          <Link href="/oportunidades" prefetch={false} className="btn">
            Ver oportunidades
          </Link>
        </div>

        {feedback ? (
          <div className="panel-muted" style={{ marginBottom: 16 }}>
            {feedback}
          </div>
        ) : null}

        {loading ? <div className="dashboard-card__empty">Carregando favoritos...</div> : null}

        {!loading && listings.length === 0 ? (
          <div className="dashboard-card__empty">
            <div className="empty-state__icon">*</div>
            <div style={{ marginBottom: 10 }}>Nenhum favorito ainda.</div>
            <Link href="/oportunidades" prefetch={false} className="btn btn-primary">
              Explorar oportunidades
            </Link>
          </div>
        ) : null}

        <div className="listing-list">
          {listings.map((listing) => (
            <div key={listing.id}>
              <ListingCard listing={listing} onFavorite={handleFavorite} onDiscard={handleDiscard} />
              <div style={{ marginTop: 8, paddingLeft: 4 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => addToPortfolio(listing)}>
                  Adicionar ao portfolio
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
