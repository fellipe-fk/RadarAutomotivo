'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { Listing } from '@/types'

type CrmStatus = 'INTERESSE' | 'NEGOCIANDO' | 'COMPRADO' | 'REVENDIDO'

type CrmItem = {
  id: string
  title: string
  precoCompra: number | null
  precoVenda: number | null
  status: CrmStatus
  notes: string | null
  listingId: string | null
  year: number | null
  mileage: number | null
  updatedAt: string
}

const statusOrder: CrmStatus[] = ['INTERESSE', 'NEGOCIANDO', 'COMPRADO', 'REVENDIDO']

const statusMeta: Record<
  CrmStatus,
  {
    label: string
    color: string
  }
> = {
  INTERESSE: { label: 'Interesse', color: '#888888' },
  NEGOCIANDO: { label: 'Em negociacao', color: '#185fa5' },
  COMPRADO: { label: 'Comprado', color: '#639922' },
  REVENDIDO: { label: 'Revendido', color: '#ba7517' },
}

function formatMoney(value?: number | null) {
  return `R$ ${Math.round(value || 0).toLocaleString('pt-BR')}`
}

export default function CRMPage() {
  const [items, setItems] = useState<CrmItem[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [form, setForm] = useState({
    listingId: '',
    title: '',
    precoCompra: '',
    status: 'INTERESSE' as CrmStatus,
    notes: 'Via analise de anuncio',
  })

  async function fetchCrmData() {
    setLoading(true)

    try {
      const [crmResponse, listingsResponse] = await Promise.all([
        fetch('/api/crm'),
        fetch('/api/listings?status=ANALYZED'),
      ])

      const crmData = await crmResponse.json()
      const listingsData = await listingsResponse.json()

      setItems(crmData.items || [])
      setListings(listingsData.listings || [])
    } catch (error) {
      console.error(error)
      setFeedback('Nao foi possivel carregar o portfolio agora.')
      setItems([])
      setListings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCrmData()
  }, [])

  const linkedListingIds = useMemo(
    () => new Set(items.map((item) => item.listingId).filter(Boolean)),
    [items]
  )

  const availableListings = useMemo(
    () => listings.filter((listing) => !linkedListingIds.has(listing.id)),
    [linkedListingIds, listings]
  )

  const metrics = useMemo(() => {
    const invested = items
      .filter((item) => item.status === 'COMPRADO' || item.status === 'REVENDIDO')
      .reduce((total, item) => total + (item.precoCompra || 0), 0)

    const sold = items
      .filter((item) => item.status === 'REVENDIDO')
      .reduce((total, item) => total + (item.precoVenda || Math.round((item.precoCompra || 0) * 1.12)), 0)

    const soldCost = items
      .filter((item) => item.status === 'REVENDIDO')
      .reduce((total, item) => total + (item.precoCompra || 0), 0)

    return {
      total: items.length,
      invested,
      sold,
      profit: sold - soldCost,
    }
  }, [items])

  function handleListingChange(listingId: string) {
    const selected = availableListings.find((listing) => listing.id === listingId)

    setForm((current) => ({
      ...current,
      listingId,
      title: selected?.title || current.title,
      precoCompra: selected?.price ? String(Math.round(selected.price)) : current.precoCompra,
    }))
  }

  async function createItem() {
    if (!form.title.trim() || !form.precoCompra) {
      setFeedback('Preencha o veiculo e o preco de compra.')
      return
    }

    setSaving(true)
    setFeedback('')

    try {
      const response = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: form.listingId || undefined,
          title: form.title,
          precoCompra: Number(form.precoCompra),
          status: form.status,
          notes: form.notes,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao adicionar no portfolio.')
      }

      setShowForm(false)
      setForm({
        listingId: '',
        title: '',
        precoCompra: '',
        status: 'INTERESSE',
        notes: 'Via analise de anuncio',
      })
      setFeedback('Veiculo adicionado ao portfolio.')
      await fetchCrmData()
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao adicionar no portfolio.')
    } finally {
      setSaving(false)
    }
  }

  async function updateItem(id: string, nextStatus: CrmStatus, precoVenda?: number) {
    try {
      const response = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: nextStatus,
          precoVenda,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao atualizar item.')
      }

      setFeedback(`Item movido para ${statusMeta[nextStatus].label.toLowerCase()}.`)
      await fetchCrmData()
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao atualizar item.')
    }
  }

  function moveToNextStage(item: CrmItem) {
    const currentIndex = statusOrder.indexOf(item.status)
    const nextStatus = statusOrder[currentIndex + 1]

    if (!nextStatus) return

    if (nextStatus === 'REVENDIDO') {
      const suggestedSale = item.precoVenda || Math.round((item.precoCompra || 0) * 1.12)
      updateItem(item.id, nextStatus, suggestedSale)
      return
    }

    updateItem(item.id, nextStatus)
  }

  return (
    <div className="app-layout" data-page-id="crm">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
        <h1 className="page-title">Meu portfolio</h1>
        <p className="page-subtitle">Gerencie cada veiculo do interesse a revenda</p>
          </div>

          <button type="button" className="btn btn-primary" onClick={() => setShowForm((current) => !current)}>
            {showForm ? 'Fechar' : '+ Adicionar'}
          </button>
        </div>

        {showForm ? (
          <section className="card inline-form">
            <div className="card-title">Adicionar veiculo ao portfolio</div>

            <div className="form-grid form-grid--2">
              <div>
                <label className="form-label">Aproveitar anuncio analisado</label>
                <select value={form.listingId} onChange={(event) => handleListingChange(event.target.value)}>
                  <option value="">Selecionar depois</option>
                  {availableListings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Status inicial</label>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as CrmStatus }))}
                >
                  {statusOrder.map((status) => (
                    <option key={status} value={status}>
                      {statusMeta[status].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid form-grid--2">
              <div>
                <label className="form-label">Veiculo</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex: Honda XRE 300 2021"
                />
              </div>

              <div>
                <label className="form-label">Preco de compra</label>
                <input
                  type="number"
                  value={form.precoCompra}
                  onChange={(event) => setForm((current) => ({ ...current, precoCompra: event.target.value }))}
                  placeholder="21900"
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Observacoes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Anote proxima etapa, origem e combinados."
              />
            </div>

            <div className="page-header__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={createItem} disabled={saving}>
                {saving ? 'Salvando...' : 'Adicionar ao portfolio'}
              </button>
              {feedback ? <span className="section-title__hint">{feedback}</span> : null}
            </div>
          </section>
        ) : null}

        <section className="kanban">
          {statusOrder.map((status) => {
            const columnItems = items.filter((item) => item.status === status)

            return (
              <article key={status} className="kanban-col">
                <div className="kanban-col-title">
                  <span style={{ color: statusMeta[status].color }}>{statusMeta[status].label}</span>
                  <span>{columnItems.length}</span>
                </div>

                {loading ? <div className="section-title__hint">Carregando...</div> : null}

                {!loading && columnItems.length === 0 ? (
                  <div className="section-title__hint">Nenhum veiculo nesta etapa.</div>
                ) : null}

                {columnItems.map((item) => (
                  <div key={item.id} className="kanban-card">
                    <div className="kcard-title">{item.title}</div>
                    <div className="kcard-price">{formatMoney(item.precoCompra)}</div>
                    <div className="kcard-meta">
                      {item.notes || 'Sem observacoes ainda.'}
                      {item.status === 'REVENDIDO' && item.precoVenda ? ` | venda ${formatMoney(item.precoVenda)}` : ''}
                    </div>

                    <div className="kanban-card__actions">
                      {item.status !== 'REVENDIDO' ? (
                        <button type="button" className="btn btn-sm" onClick={() => moveToNextStage(item)}>
                          Avancar
                        </button>
                      ) : (
                        <span className="badge badge--success">Concluido</span>
                      )}
                    </div>
                  </div>
                ))}
              </article>
            )
          })}
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Resumo financeiro</div>
          <div className="form-grid form-grid--3">
            <div className="metric">
              <div className="metric-label">Investido</div>
              <div className="metric-value">{formatMoney(metrics.invested)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Revendido</div>
              <div className="metric-value" style={{ color: '#27500A' }}>
                {formatMoney(metrics.sold)}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Lucro realizado</div>
              <div className="metric-value" style={{ color: '#185fa5' }}>
                {formatMoney(metrics.profit)}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
