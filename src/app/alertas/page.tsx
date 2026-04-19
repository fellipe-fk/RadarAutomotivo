'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { formatRiskLabel, matchesRadar, type RadarConfigLike } from '@/lib/radar'
import type { Listing } from '@/types'

type UserProfile = {
  emailAlertas: boolean
  whatsappEnabled: boolean
  telegramEnabled: boolean
}

type AlertHistoryItem = {
  id: string
  channel: string
  message: string
  sent: boolean
  sentAt?: string | null
  createdAt: string
  errorMsg?: string | null
  listing?: {
    id: string
    title: string
    price: number
    city?: string | null
    sourceUrl?: string | null
    opportunityScore?: number | null
    estimatedMargin?: number | null
  } | null
}

type AlertStats = {
  readyCount: number
  totalAlerts: number
  sentCount: number
  failedCount: number
  suppressedCount?: number
  lastTriggeredAt?: string | null
}

type ReviewQueueItem = {
  id: string
  title: string
  price: number
  city?: string | null
  sourceUrl?: string | null
  opportunityScore?: number | null
  estimatedMargin?: number | null
  riskLevel?: string | null
  aiSummary?: string | null
  positiveSignals: string[]
  alertSignals: string[]
  latestAlert?: {
    id: string
    createdAt: string
    sent: boolean
    errorMsg?: string | null
  } | null
  reviewDecision?: {
    status: 'APPROVED' | 'REJECTED'
    note?: string | null
    decidedAt: string
  } | null
}

type AlertsPayload = {
  config: RadarConfigLike
  stats: AlertStats
  history: AlertHistoryItem[]
  reviewQueue: ReviewQueueItem[]
}

function formatMoney(value?: number | null) {
  return `R$ ${Math.round(value || 0).toLocaleString('pt-BR')}`
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

function normalizeSuppressionReason(error?: string | null) {
  if (!error) return null
  return error.replace(/^Suprimido:\s*/i, '')
}

export default function AlertasPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [config, setConfig] = useState<RadarConfigLike | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [history, setHistory] = useState<AlertHistoryItem[]>([])
  const [stats, setStats] = useState<AlertStats>({ readyCount: 0, totalAlerts: 0, sentCount: 0, failedCount: 0, suppressedCount: 0 })
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [forcingId, setForcingId] = useState('')
  const [reviewingId, setReviewingId] = useState('')

  async function fetchData() {
    setLoading(true)

    try {
      const [userResponse, alertsResponse, listingsResponse] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/alerts'),
        fetch('/api/listings?status=ANALYZED'),
      ])

      const userData = await userResponse.json()
      const alertsData = (await alertsResponse.json()) as AlertsPayload
      const listingsData = await listingsResponse.json()

      setUser(userData.user || null)
      setConfig(alertsData.config || null)
      setListings(listingsData.listings || [])
      setHistory(alertsData.history || [])
      setStats(alertsData.stats || { readyCount: 0, totalAlerts: 0, sentCount: 0, failedCount: 0, suppressedCount: 0 })
      setReviewQueue(alertsData.reviewQueue || [])
    } catch (error) {
      console.error(error)
      setUser(null)
      setConfig(null)
      setListings([])
      setHistory([])
      setStats({ readyCount: 0, totalAlerts: 0, sentCount: 0, failedCount: 0, suppressedCount: 0 })
      setReviewQueue([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const matchedListings = useMemo(() => listings.filter((listing) => matchesRadar(listing, config)), [config, listings])

  const derivedReviewQueue = useMemo(() => {
    if (reviewQueue.length > 0) return reviewQueue

    return matchedListings
      .filter((listing) => !listing.alertSent && listing.latestAlert && !listing.latestAlert.sent)
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        city: listing.city,
        sourceUrl: listing.sourceUrl,
        opportunityScore: listing.opportunityScore,
        estimatedMargin: listing.estimatedMargin,
        riskLevel: listing.riskLevel,
        aiSummary: listing.aiSummary,
        positiveSignals: listing.positiveSignals,
        alertSignals: listing.alertSignals,
        latestAlert: listing.latestAlert
          ? {
              id: listing.id,
              createdAt: listing.latestAlert.createdAt,
              sent: listing.latestAlert.sent,
              errorMsg: listing.latestAlert.errorMsg,
            }
          : null,
        reviewDecision: listing.reviewDecision
          ? {
              status: listing.reviewDecision.status,
              note: listing.reviewDecision.note,
              decidedAt: listing.reviewDecision.decidedAt,
            }
          : null,
      }))
  }, [matchedListings, reviewQueue])

  const channels = useMemo(
    () => [
      {
        name: 'WhatsApp',
        detail: 'Alertas de oportunidade forte e avisos de alta urgencia.',
        status: user?.whatsappEnabled ? 'Ativo' : 'Desligado',
      },
      {
        name: 'Email',
        detail: 'Resumo diario e relatorio de oportunidades fortes.',
        status: user?.emailAlertas ? 'Ativo' : 'Desligado',
      },
      {
        name: 'Telegram',
        detail: 'Disparo imediato quando um anuncio passa no score do radar.',
        status: user?.telegramEnabled ? 'Ativo' : 'Desligado',
      },
      {
        name: 'Painel web',
        detail: 'Tudo aparece instantaneamente no modulo Oportunidades.',
        status: 'Ativo',
      },
    ],
    [user?.emailAlertas, user?.telegramEnabled, user?.whatsappEnabled]
  )

  const previewListing = history[0]?.listing || matchedListings[0]

  const ruleCards = [
    {
      id: 'AL-01',
      title: 'Score minimo',
      description: 'Anuncios so entram nos alertas quando cruzam a linha minima de oportunidade configurada.',
      value: `${config?.scoreAlerta ?? 75} pontos`,
    },
    {
      id: 'AL-02',
      title: 'Risco maximo',
      description: 'Limita notificacoes a oportunidades com nivel de risco compativel com sua operacao.',
      value: formatRiskLabel(config?.riscoMax),
    },
    {
      id: 'AL-03',
      title: 'Margem minima',
      description: 'Mantem o fluxo focado em oportunidades com retorno economico suficiente para revenda.',
      value: formatMoney(config?.margemMin),
    },
    {
      id: 'AL-04',
      title: 'Distancia maxima',
      description: 'Considera somente negocios dentro do raio que faz sentido visitar ou negociar.',
      value: `${config?.distanciaMax ?? 120} km`,
    },
  ]

  async function handleForceAlert(listingId: string) {
    setForcingId(listingId)

    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'force-alert',
          listingId,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao forcar envio do alerta.')
      }

      await fetchData()
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : 'Falha ao forcar envio do alerta.')
    } finally {
      setForcingId('')
    }
  }

  async function handleReviewDecision(listingId: string, status: 'APPROVED' | 'REJECTED', sendNow = false) {
    setReviewingId(listingId)

    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review-decision',
          listingId,
          status,
          sendNow,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao salvar decisao de revisao.')
      }

      await fetchData()
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : 'Falha ao salvar decisao de revisao.')
    } finally {
      setReviewingId('')
    }
  }

  function getDecisionLabel(status?: 'APPROVED' | 'REJECTED' | null) {
    if (status === 'APPROVED') return 'Aprovado'
    if (status === 'REJECTED') return 'Rejeitado'
    return 'Pendente'
  }

  return (
    <div className="app-layout" data-page-id="alertas">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Central de alertas</h1>
            <p className="page-subtitle">Controle os disparos automaticos e revise manualmente os anuncios que o sistema segurou.</p>
          </div>

          <div className="page-header__actions">
            <Link href="/radar" className="btn">
              Ajustar radar
            </Link>
            <Link href="/perfil" className="btn btn-primary">
              Canais e preferencias
            </Link>
          </div>
        </div>

        <div className={`radar-status ${config?.ativo === false ? 'off' : 'on'}`}>
          <div className={`rdot ${config?.ativo === false ? 'off' : 'on'}`} />
          <div>
            <strong>{config?.ativo === false ? 'Radar pausado' : 'Radar ativo'}</strong> | {matchedListings.length} oportunidades em linha com o radar atual
          </div>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <div className="label">Alertas prontos</div>
            <div className="value">{stats.readyCount}</div>
            <div className="sub">em linha com o radar</div>
          </article>

          <article className="metric-card">
            <div className="label">Enviados</div>
            <div className="value">{stats.sentCount}</div>
            <div className="sub">historico confirmado</div>
          </article>

          <article className="metric-card">
            <div className="label">Falhas</div>
            <div className="value">{stats.failedCount}</div>
            <div className="sub">tentativas nao entregues</div>
          </article>

          <article className="metric-card">
            <div className="label">Segurados</div>
            <div className="value">{stats.suppressedCount || derivedReviewQueue.length}</div>
            <div className="sub">pedem revisao manual</div>
          </article>
        </div>

        <section className="card">
          <div className="card-title">Fila de revisao manual</div>
          <div className="stack">
            {!loading && derivedReviewQueue.length === 0 ? <div className="panel-muted">Nenhum alerta segurado no momento.</div> : null}
            {derivedReviewQueue.map((item) => (
              <div key={item.id} className="panel-muted" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{item.title}</strong>
                    <div className="section-title__hint" style={{ marginTop: 6 }}>
                      Score {item.opportunityScore || 0} | risco {formatRiskLabel(item.riskLevel || undefined)} | {formatMoney(item.price)}
                    </div>
                    <div className="section-title__hint">
                      {item.city || 'Cidade nao informada'} | margem {formatMoney(item.estimatedMargin)}
                    </div>
                    <div className="section-title__hint">
                      Motivo: {normalizeSuppressionReason(item.latestAlert?.errorMsg) || 'Sem motivo operacional registrado'}
                    </div>
                    <div className="section-title__hint">
                      Ultima decisao {formatRelativeTime(item.latestAlert?.createdAt)}
                    </div>
                    <div className="section-title__hint">
                      Revisao: {getDecisionLabel(item.reviewDecision?.status)}{' '}
                      {item.reviewDecision?.decidedAt ? `| salva ${formatRelativeTime(item.reviewDecision.decidedAt)}` : ''}
                    </div>
                    {item.reviewDecision?.note ? <div className="section-title__hint">Nota: {item.reviewDecision.note}</div> : null}
                  </div>

                  <div className="page-header__actions">
                    {item.sourceUrl ? (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn">
                        Ver anuncio
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleReviewDecision(item.id, 'APPROVED')}
                      disabled={forcingId === item.id || reviewingId === item.id}
                    >
                      {reviewingId === item.id ? 'Salvando...' : 'Aprovar'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleReviewDecision(item.id, 'REJECTED')}
                      disabled={forcingId === item.id || reviewingId === item.id}
                    >
                      {reviewingId === item.id ? 'Salvando...' : 'Rejeitar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleReviewDecision(item.id, 'APPROVED', true)}
                      disabled={forcingId === item.id || reviewingId === item.id}
                    >
                      {reviewingId === item.id ? 'Enviando...' : 'Aprovar e enviar'}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => handleForceAlert(item.id)} disabled={forcingId === item.id}>
                      {forcingId === item.id ? 'Enviando...' : 'Forcar alerta'}
                    </button>
                  </div>
                </div>

                {item.aiSummary ? <div className="section-title__hint" style={{ marginTop: 10 }}>{item.aiSummary}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Regras ativas</div>
          <div className="system-grid system-grid--2">
            {ruleCards.map((rule) => (
              <article key={rule.id} className="system-card">
                <div className="system-card__head">
                  <span className="system-card__id">{rule.id}</span>
                  <span className="badge badge--success">Ativa</span>
                </div>
                <h3 className="section-title">{rule.title}</h3>
                <p>{rule.description}</p>
                <div className="metric" style={{ marginTop: 12 }}>
                  <div className="metric-label">Parametro atual</div>
                  <div className="metric-value">{rule.value}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="system-grid system-grid--2">
          <section className="card">
            <div className="card-title">Canais de envio</div>

            <div className="stack">
              {channels.map((channel) => (
                <div className="integration-row" key={channel.name}>
                  <div>
                    <strong>{channel.name}</strong>
                    <p>{channel.detail}</p>
                  </div>
                  <span className={`badge ${channel.status === 'Ativo' ? 'badge--success' : ''}`}>{channel.status}</span>
                </div>
              ))}
            </div>

            <div className="panel-muted" style={{ marginTop: 16, marginBottom: 0 }}>
              {channels.filter((channel) => channel.status === 'Ativo').length} de 4 canais estao ativos para esta conta.
            </div>
          </section>

          <section className="card">
            <div className="card-title">Preview do alerta</div>

            <div className="alert-preview">
              {previewListing ? (
                <>
                  <div>{history[0] ? 'Ultimo alerta registrado' : 'Nova oportunidade forte detectada'}</div>
                  <div>{previewListing.title}</div>
                  <div>
                    Score {previewListing.opportunityScore || 0} | {formatMoney(previewListing.price)}
                  </div>
                  <div>
                    {previewListing.city || 'Cidade nao informada'} | margem estimada {formatMoney(previewListing.estimatedMargin)}
                  </div>
                </>
              ) : (
                <div>Nenhuma oportunidade forte para exibir agora.</div>
              )}
            </div>

            <div className="card-title" style={{ marginTop: 18 }}>
              Historico real de alertas
            </div>
            <div className="scan-log">
              {loading ? <div className="scan-log__line">Carregando...</div> : null}
              {!loading && history.length === 0 ? <div className="scan-log__line">Nenhum alerta disparado ainda.</div> : null}
              {!loading
                ? history.slice(0, 8).map((alert) => (
                    <div
                      key={alert.id}
                      className={alert.sent ? 'scan-log__line scan-log__line--ok' : 'scan-log__line scan-log__line--skip'}
                    >
                      {(alert.listing?.title || alert.channel).slice(0, 80)} |{' '}
                      {alert.sent ? `enviado via ${alert.channel}` : alert.errorMsg || 'falha no envio'}
                    </div>
                  ))
                : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
