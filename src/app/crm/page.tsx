'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { Listing } from '@/types'

type CrmStatus = 'INTERESSE' | 'NEGOCIANDO' | 'COMPRADO' | 'REVENDIDO' | 'FALHA_NEGOCIACAO'

type CrmItem = {
  id: string
  title: string
  precoCompra?: number | null
  precoVenda?: number | null
  status: CrmStatus
  notes?: string | null
  plate?: string | null
  year?: number | null
  mileage?: number | null
  listingId?: string | null
  createdAt: string
  deletedAt?: string | null
}

type FinancialSummary = {
  investido: number
  revendido: number
  lucro: number
  negociando: number
  totalItens: number
}

const statusMeta: Record<CrmStatus, { label: string; color: string }> = {
  INTERESSE: { label: 'Interesse', color: '#888888' },
  NEGOCIANDO: { label: 'Em negociacao', color: '#185FA5' },
  COMPRADO: { label: 'Comprado', color: '#639922' },
  REVENDIDO: { label: 'Revendido', color: '#BA7517' },
  FALHA_NEGOCIACAO: { label: 'Falha de negociacao', color: '#A32D2D' },
}

const pipeline: CrmStatus[] = ['INTERESSE', 'NEGOCIANDO', 'COMPRADO', 'REVENDIDO']

function formatMoney(value?: number | null) {
  if (!value) return '-'
  return `R$ ${value.toLocaleString('pt-BR')}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR')
}

export default function CrmPage() {
  const [items, setItems] = useState<CrmItem[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [financial, setFinancial] = useState<FinancialSummary>({
    investido: 0,
    revendido: 0,
    lucro: 0,
    negociando: 0,
    totalItens: 0,
  })
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [showFailures, setShowFailures] = useState(false)
  const [trashItems, setTrashItems] = useState<CrmItem[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [form, setForm] = useState({
    listingId: '',
    status: 'INTERESSE' as CrmStatus,
    title: '',
    precoCompra: '',
    notes: '',
    plate: '',
    year: '',
    mileage: '',
  })

  async function fetchCrmData() {
    setLoading(true)

    try {
      const [crmResponse, trashResponse, listingsResponse] = await Promise.all([
        fetch('/api/crm'),
        fetch('/api/crm?view=trash'),
        fetch('/api/listings?status=ANALYZED'),
      ])
      const crmData = await crmResponse.json()
      const trashData = await trashResponse.json()
      const listingsData = await listingsResponse.json()

      setItems(crmData.items || [])
      setTrashItems(trashData.items || [])
      setFinancial(
        crmData.financial || {
          investido: 0,
          revendido: 0,
          lucro: 0,
          negociando: 0,
          totalItens: 0,
        }
      )
      setListings(listingsData.listings || [])
    } catch (error) {
      console.error(error)
      setFeedback('Nao foi possivel carregar o portfolio agora.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCrmData()
  }, [])

  function notify(message: string) {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 3500)
  }

  async function handleAdd() {
    const selectedListing = listings.find((listing) => listing.id === form.listingId)
    const payload = {
      listingId: form.listingId || undefined,
      title: form.title || selectedListing?.title || 'Veiculo',
      precoCompra: form.precoCompra ? Number(form.precoCompra) : selectedListing?.price,
      status: form.status,
      notes: form.notes || undefined,
      plate: form.plate || undefined,
      year: form.year ? Number(form.year) : undefined,
      mileage: form.mileage ? Number(form.mileage) : undefined,
    }

    try {
      const response = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error()

      setShowForm(false)
      setForm({
        listingId: '',
        status: 'INTERESSE',
        title: '',
        precoCompra: '',
        notes: '',
        plate: '',
        year: '',
        mileage: '',
      })
      await fetchCrmData()
      notify('Veiculo adicionado ao portfolio.')
    } catch {
      notify('Erro ao adicionar. Tente novamente.')
    }
  }

  async function updateStatus(item: CrmItem, status: CrmStatus, precoVenda?: number) {
    try {
      const response = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status, precoVenda }),
      })

      if (!response.ok) throw new Error()
      await fetchCrmData()
      notify(`Movido para ${statusMeta[status].label}.`)
    } catch {
      notify('Erro ao atualizar item.')
    }
  }

  async function advanceStatus(item: CrmItem) {
    const currentIndex = pipeline.indexOf(item.status)
    if (currentIndex < 0 || currentIndex >= pipeline.length - 1) return

    const nextStatus = pipeline[currentIndex + 1]

    if (nextStatus === 'REVENDIDO') {
      const input = window.prompt(`Qual foi o preco de venda de "${item.title}"? (R$)`, String(item.precoVenda || ''))
      if (!input) return
      const precoVenda = Number(input.replace(/[^\d]/g, ''))
      if (!precoVenda) return
      await updateStatus(item, nextStatus, precoVenda)
      return
    }

    await updateStatus(item, nextStatus)
  }

  async function markFailed(item: CrmItem) {
    if (!window.confirm(`Marcar "${item.title}" como falha de negociacao?`)) return
    await updateStatus(item, 'FALHA_NEGOCIACAO')
  }

  async function removeItem(id: string) {
    if (!window.confirm('Remover este item do portfolio?')) return

    try {
      const response = await fetch('/api/crm', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!response.ok) throw new Error()
      await fetchCrmData()
      notify('Item enviado para a lixeira.')
    } catch {
      notify('Erro ao remover item.')
    }
  }

  async function restoreItem(id: string) {
    try {
      const response = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, restore: true }),
      })

      if (!response.ok) throw new Error()
      await fetchCrmData()
      notify('Item restaurado da lixeira.')
    } catch {
      notify('Erro ao restaurar item.')
    }
  }

  const activeItems = useMemo(() => items.filter((item) => item.status !== 'FALHA_NEGOCIACAO'), [items])
  const failedItems = useMemo(() => items.filter((item) => item.status === 'FALHA_NEGOCIACAO'), [items])

  return (
    <div className="app-layout" data-page-id="crm">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Meu portfolio</h1>
            <p className="page-subtitle">Gerencie cada veiculo do interesse ate a revenda.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((current) => !current)}>
            {showForm ? 'Fechar' : '+ Adicionar'}
          </button>
        </div>

        {feedback ? (
          <div className="panel-muted" style={{ marginBottom: 16 }}>
            {feedback}
          </div>
        ) : null}

        {showForm ? (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-title">Adicionar veiculo ao portfolio</div>

            <div className="form-grid form-grid--2" style={{ marginBottom: 12 }}>
              <div>
                <label className="form-label">Aproveitar anuncio analisado</label>
                <select value={form.listingId} onChange={(event) => setForm((current) => ({ ...current, listingId: event.target.value }))}>
                  <option value="">Selecionar depois</option>
                  {listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.title} - R$ {listing.price.toLocaleString('pt-BR')}
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
                  {pipeline.map((status) => (
                    <option key={status} value={status}>
                      {statusMeta[status].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid form-grid--2" style={{ marginBottom: 12 }}>
              <div>
                <label className="form-label">Veiculo</label>
                <input
                  type="text"
                  placeholder="Ex: Honda XRE 300 2021"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Preco de compra (R$)</label>
                <input
                  type="number"
                  placeholder="21900"
                  value={form.precoCompra}
                  onChange={(event) => setForm((current) => ({ ...current, precoCompra: event.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Observacoes</label>
              <textarea
                rows={3}
                placeholder="Notas sobre a negociacao, condicao do veiculo e proximos passos."
                value={form.notes}
                style={{ resize: 'vertical', width: '100%' }}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>

            <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={handleAdd}>
              Adicionar ao portfolio
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="panel-muted">Carregando portfolio...</div>
        ) : (
          <section className="kanban" style={{ marginBottom: 32 }}>
            {pipeline.map((status) => {
              const columnItems = activeItems.filter((item) => item.status === status)
              const meta = statusMeta[status]

              return (
                <article key={status} className="kanban-col">
                  <div className="kanban-col-title">
                    <span style={{ color: meta.color }}>{meta.label}</span>
                    <span>{columnItems.length}</span>
                  </div>

                  {columnItems.length === 0 ? <div className="section-title__hint">Nenhum veiculo nesta etapa.</div> : null}

                  {columnItems.map((item) => (
                    <div key={item.id} className="kanban-card">
                      <div className="kcard-title">{item.title}</div>
                      <div className="kcard-price" style={{ color: meta.color }}>
                        {formatMoney(item.precoCompra)}
                        {item.status === 'REVENDIDO' && item.precoVenda ? ` -> ${formatMoney(item.precoVenda)}` : ''}
                      </div>

                      {item.notes ? <div className="kcard-meta">{item.notes}</div> : null}

                      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>{formatDate(item.createdAt)}</div>

                      <div className="kanban-card__actions" style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {item.status !== 'REVENDIDO' ? (
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => advanceStatus(item)}>
                            Avancar
                          </button>
                        ) : (
                          <span className="badge badge--success">Concluido</span>
                        )}

                        {(item.status === 'INTERESSE' || item.status === 'NEGOCIANDO') ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ color: '#A32D2D', borderColor: '#A32D2D' }}
                            onClick={() => markFailed(item)}
                          >
                            Falha
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ color: '#888', borderColor: '#ddd' }}
                          onClick={() => removeItem(item.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </article>
              )
            })}
          </section>
        )}

        {failedItems.length > 0 ? (
          <div className="card" style={{ marginBottom: 24, borderColor: '#F09595' }}>
            <div className="card-title" style={{ color: '#A32D2D', cursor: 'pointer' }} onClick={() => setShowFailures((current) => !current)}>
              Falhas de negociacao ({failedItems.length}) {showFailures ? '^' : 'v'}
            </div>

            {showFailures
              ? failedItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid #f0f0ee',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {formatMoney(item.precoCompra)} | {formatDate(item.createdAt)}
                      </div>
                      {item.notes ? <div style={{ fontSize: 12, color: '#888' }}>{item.notes}</div> : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: '#888', borderColor: '#ddd' }}
                      onClick={() => removeItem(item.id)}
                    >
                      Remover
                    </button>
                  </div>
                ))
              : null}
          </div>
        ) : null}

        {trashItems.length > 0 ? (
          <div className="card" style={{ marginBottom: 24, borderColor: '#d8d8d3' }}>
            <div className="card-title" style={{ color: '#666', cursor: 'pointer' }} onClick={() => setShowTrash((current) => !current)}>
              Lixeira ({trashItems.length}) {showTrash ? '^' : 'v'}
            </div>

            {showTrash
              ? trashItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid #f0f0ee',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {formatMoney(item.precoCompra)} | removido em {item.deletedAt ? formatDate(item.deletedAt) : '-'}
                      </div>
                      {item.notes ? <div style={{ fontSize: 12, color: '#888' }}>{item.notes}</div> : null}
                    </div>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => restoreItem(item.id)}>
                      Restaurar
                    </button>
                  </div>
                ))
              : null}
          </div>
        ) : null}

        <div className="card">
          <div className="card-title">Resumo financeiro</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div style={{ background: '#f5f5f3', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Investido</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(financial.investido)}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>veiculos comprados</div>
            </div>

            <div style={{ background: '#f5f5f3', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Revendido</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#639922' }}>{formatMoney(financial.revendido)}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>receita bruta</div>
            </div>

            <div style={{ background: financial.lucro > 0 ? '#EAF3DE' : '#f5f5f3', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Lucro realizado</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: financial.lucro > 0 ? '#27500A' : '#185FA5' }}>
                {formatMoney(financial.lucro)}
              </div>
              <div style={{ fontSize: 11, color: '#aaa' }}>revendido - investido</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
