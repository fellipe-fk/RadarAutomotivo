'use client'

import { useEffect, useState } from 'react'

import ListingCard from '@/components/listings/ListingCard'
import Sidebar from '@/components/ui/Sidebar'
import { Listing } from '@/types'

type CrmItem = {
  id: string
  title: string
  precoCompra?: number | null
  status: string
  notes?: string | null
  deletedAt?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR')
}

function formatMoney(value?: number | null) {
  if (!value) return '-'
  return `R$ ${value.toLocaleString('pt-BR')}`
}

export default function LixeiraPage() {
  const [discardedListings, setDiscardedListings] = useState<Listing[]>([])
  const [trashedListings, setTrashedListings] = useState<Listing[]>([])
  const [trashedCrmItems, setTrashedCrmItems] = useState<CrmItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  async function loadTrashData() {
    setLoading(true)

    try {
      const [discardedResponse, trashedListingsResponse, trashedCrmResponse] = await Promise.all([
        fetch('/api/listings?view=discarded'),
        fetch('/api/listings?view=trash'),
        fetch('/api/crm?view=trash'),
      ])

      const discardedData = await discardedResponse.json()
      const trashedListingsData = await trashedListingsResponse.json()
      const trashedCrmData = await trashedCrmResponse.json()

      setDiscardedListings(discardedData.listings || [])
      setTrashedListings(trashedListingsData.listings || [])
      setTrashedCrmItems(trashedCrmData.items || [])
    } catch (error) {
      console.error(error)
      setDiscardedListings([])
      setTrashedListings([])
      setTrashedCrmItems([])
      setFeedback('Nao foi possivel carregar a lixeira agora.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTrashData()
  }, [])

  function notify(message: string) {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 3500)
  }

  async function restoreDiscardedListing(id: string) {
    try {
      const response = await fetch('/api/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isDiscarded: false }),
      })

      if (!response.ok) throw new Error()
      await loadTrashData()
      notify('Anuncio restaurado para oportunidades.')
    } catch {
      notify('Erro ao restaurar anuncio descartado.')
    }
  }

  async function restoreDeletedListing(id: string) {
    try {
      const response = await fetch('/api/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, restore: true }),
      })

      if (!response.ok) throw new Error()
      await loadTrashData()
      notify('Anuncio restaurado da lixeira.')
    } catch {
      notify('Erro ao restaurar anuncio da lixeira.')
    }
  }

  async function restoreCrmItem(id: string) {
    try {
      const response = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, restore: true }),
      })

      if (!response.ok) throw new Error()
      await loadTrashData()
      notify('Item do portfolio restaurado.')
    } catch {
      notify('Erro ao restaurar item do portfolio.')
    }
  }

  const isEmpty = !loading && discardedListings.length === 0 && trashedListings.length === 0 && trashedCrmItems.length === 0

  return (
    <div className="app-layout" data-page-id="lixeira">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Lixeira</h1>
            <p className="page-subtitle">Recupere anuncios descartados, itens removidos do CRM e listagens enviadas para lixeira.</p>
          </div>
        </div>

        {feedback ? (
          <div className="panel-muted" style={{ marginBottom: 16 }}>
            {feedback}
          </div>
        ) : null}

        {loading ? <div className="dashboard-card__empty">Carregando lixeira...</div> : null}

        {isEmpty ? (
          <div className="dashboard-card__empty">
            <div className="empty-state__icon">*</div>
            <div style={{ marginBottom: 10 }}>Nenhum item na lixeira ou nos descartados.</div>
          </div>
        ) : null}

        {!loading && discardedListings.length > 0 ? (
          <section className="card" style={{ marginBottom: 24 }}>
            <div className="card-title">Anuncios descartados ({discardedListings.length})</div>
            <div className="section-title__hint" style={{ marginBottom: 16 }}>
              Estes anuncios foram ocultados das telas de oportunidade, mas ainda podem voltar sem perda de historico.
            </div>
            <div className="listing-list">
              {discardedListings.map((listing) => (
                <div key={listing.id}>
                  <ListingCard listing={listing} compact />
                  <div style={{ marginTop: 8, paddingLeft: 4 }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => restoreDiscardedListing(listing.id)}>
                      Restaurar anuncio
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && trashedListings.length > 0 ? (
          <section className="card" style={{ marginBottom: 24 }}>
            <div className="card-title">Listagens na lixeira ({trashedListings.length})</div>
            <div className="section-title__hint" style={{ marginBottom: 16 }}>
              Ao restaurar uma listagem daqui, o vinculo com o portfolio volta junto quando existir.
            </div>
            <div className="listing-list">
              {trashedListings.map((listing) => (
                <div key={listing.id}>
                  <ListingCard listing={listing} compact />
                  <div style={{ marginTop: 8, paddingLeft: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div className="section-title__hint">Removido em {formatDate(listing.deletedAt)}</div>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => restoreDeletedListing(listing.id)}>
                      Restaurar da lixeira
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && trashedCrmItems.length > 0 ? (
          <section className="card">
            <div className="card-title">Itens removidos do portfolio ({trashedCrmItems.length})</div>
            <div className="section-title__hint" style={{ marginBottom: 16 }}>
              Itens restaurados voltam para o CRM na etapa em que estavam quando foram removidos.
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {trashedCrmItems.map((item) => (
                <article
                  key={item.id}
                  style={{
                    border: '1px solid #ecece7',
                    borderRadius: 14,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#7c7c74', marginTop: 4 }}>
                      {item.status} | compra {formatMoney(item.precoCompra)} | removido em {formatDate(item.deletedAt)}
                    </div>
                    {item.notes ? <div style={{ fontSize: 12, color: '#7c7c74', marginTop: 6 }}>{item.notes}</div> : null}
                  </div>

                  <button type="button" className="btn btn-sm btn-primary" onClick={() => restoreCrmItem(item.id)}>
                    Restaurar no portfolio
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
