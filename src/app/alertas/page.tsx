'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { formatRiskLabel, matchesRadar, safeNumber, type RadarConfigLike } from '@/lib/radar'
import { Listing } from '@/types'

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
  lastTriggeredAt?: string | null
}

function formatMoney(value?: number | null) {
  return `R$ ${Math.round(value || 0).toLocaleString('pt-BR')}`
}

export default function AlertasPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [config, setConfig] = useState<RadarConfigLike | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [history, setHistory] = useState<AlertHistoryItem[]>([])
  const [stats, setStats] = useState<AlertStats>({ readyCount: 0, totalAlerts: 0, sentCount: 0, failedCount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      try {
        const [userResponse, configResponse, listingsResponse] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/alerts'),
          fetch('/api/listings?status=ANALYZED'),
        ])

        const userData = await userResponse.json()
        const configData = await configResponse.json()
        const listingsData = await listingsResponse.json()

        setUser(userData.user || null)
        setConfig(configData.config || null)
        setListings(listingsData.listings || [])
        setHistory(configData.history || [])
        setStats(configData.stats || { readyCount: 0, totalAlerts: 0, sentCount: 0, failedCount: 0 })
      } catch (error) {
        console.error(error)
        setUser(null)
        setConfig(null)
        setListings([])
        setHistory([])
        setStats({ readyCount: 0, totalAlerts: 0, sentCount: 0, failedCount: 0 })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const matchedListings = useMemo(
    () => listings.filter((listing) => matchesRadar(listing, config)),
    [config, listings]
  )

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

  return (
    <div className="app-layout" data-page-id="alertas">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Configuracao de alertas</h1>
            <p className="page-subtitle">Defina quando e como receber notificacoes de oportunidades.</p>
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
            <strong>{config?.ativo === false ? 'Radar pausado' : 'Radar ativo'}</strong> |{' '}
            {matchedListings.length} oportunidades prontas para disparo nos canais habilitados
          </div>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <div className="label">Alertas prontos</div>
            <div className="value">{stats.readyCount}</div>
            <div className="sub">em linha com o radar</div>
          </article>

          <article className="metric-card">
            <div className="label">Alertas enviados</div>
            <div className="value">{stats.sentCount}</div>
            <div className="sub">historico confirmado</div>
          </article>

          <article className="metric-card">
            <div className="label">Falhas</div>
            <div className="value">{stats.failedCount}</div>
            <div className="sub">tentativas nao entregues</div>
          </article>

          <article className="metric-card">
            <div className="label">Canais ativos</div>
            <div className="value">{channels.filter((channel) => channel.status === 'Ativo').length}</div>
            <div className="sub">de 4 disponiveis</div>
          </article>
        </div>

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
          </section>

          <section className="card">
            <div className="card-title">Preview do alerta</div>

            <div className="alert-preview">
              {previewListing ? (
                <>
                  <div>{history[0] ? 'Ultimo alerta registrado' : 'Nova oportunidade forte detectada'}</div>
                  <div>{previewListing.title}</div>
                  <div>Score {previewListing.opportunityScore || 0} | {formatMoney(previewListing.price)}</div>
                  <div>
                    {previewListing.city || 'Cidade nao informada'} | margem estimada {formatMoney(previewListing.estimatedMargin)}
                  </div>
                </>
              ) : (
                <div>Nenhuma oportunidade forte para exibir agora.</div>
              )}
            </div>

            <div className="card-title" style={{ marginTop: 18 }}>Historico real de alertas</div>
            <div className="scan-log">
              {loading ? <div className="scan-log__line">Carregando...</div> : null}
              {!loading && history.length === 0 ? <div className="scan-log__line">Nenhum alerta disparado ainda.</div> : null}
              {!loading
                ? history.slice(0, 6).map((alert) => (
                    <div
                      key={alert.id}
                      className={alert.sent ? 'scan-log__line scan-log__line--ok' : 'scan-log__line scan-log__line--skip'}
                    >
                      {(alert.listing?.title || alert.channel).slice(0, 80)} | {alert.sent ? `enviado via ${alert.channel}` : alert.errorMsg || 'falha no envio'}
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
