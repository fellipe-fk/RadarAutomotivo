'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { ACTIVE_PLAN_KEY, formatPlanLabel, getPlanInfo } from '@/lib/plans'
import { formatSubscriptionStatus } from '@/lib/subscription-state'

type SubscriptionData = {
  plano: string
  assinaturaStatus: string
  persistedStatus?: string
  trialEndsAt?: string | null
  assinaturaEndsAt?: string | null
  abacatepayCustomerId?: string | null
  abacatepaySubscriptionId?: string | null
  checkoutRequired?: boolean
  hasConfirmedBilling?: boolean
  hasPendingCheckout?: boolean
  hasBillingProfile?: boolean
  latestBillingStatus?: string
  latestBillingAt?: string | null
  canCancel?: boolean
  canCreateCheckout?: boolean
}

type BillingHistoryItem = {
  id: string
  createdAt: string
  valor: number
  descricao: string
  status: string
  normalizedStatus?: string
  tone?: 'success' | 'warning' | 'danger' | 'muted' | 'default'
  tipo: string
  isLinkedToAbacatePay?: boolean
}

function formatMoney(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value?: string | null) {
  if (!value) return 'Nao definido'
  return new Date(value).toLocaleDateString('pt-BR')
}

function getHeroTone(status?: string) {
  if (status === 'ATIVA') return 'success'
  if (status === 'CANCELADA') return 'muted'
  if (status === 'PENDENTE_CHECKOUT' || status === 'TRIAL') return 'warning'
  return 'default'
}

function getBadgeClass(tone?: string) {
  if (tone === 'success') return 'badge badge--success'
  if (tone === 'warning') return 'badge badge--warning'
  if (tone === 'danger') return 'badge'
  return 'badge'
}

export default function AssinaturaPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [history, setHistory] = useState<BillingHistoryItem[]>([])
  const [billingConfigured, setBillingConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creatingPlan, setCreatingPlan] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [feedback, setFeedback] = useState('')

  const fetchSubscription = useCallback(async () => {
    const response = await fetch('/api/assinatura', { cache: 'no-store' })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Nao foi possivel carregar a assinatura.')
    }

    setSubscription(data.subscription || null)
    setHistory(data.history || [])
    setBillingConfigured(!!data.billingConfigured)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        await fetchSubscription()

        if (window.location.search.includes('onboarding=1')) {
          setFeedback('Sua conta foi criada e o plano ja esta vinculado ao checkout confirmado.')
        } else if (window.location.search.includes('checkout=success')) {
          setFeedback('Pagamento concluido. Assim que a AbacatePay sincronizar a assinatura, os dados aparecem aqui.')
        }
      } catch (error) {
        console.error(error)
        setFeedback(error instanceof Error ? error.message : 'Nao foi possivel carregar a assinatura.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [fetchSubscription])

  const currentPlan = useMemo(() => getPlanInfo(subscription?.plano), [subscription?.plano])
  const statusLabel = useMemo(() => formatSubscriptionStatus(subscription?.assinaturaStatus), [subscription?.assinaturaStatus])
  const heroTone = useMemo(() => getHeroTone(subscription?.assinaturaStatus), [subscription?.assinaturaStatus])

  const nextReference = useMemo(() => {
    if (subscription?.assinaturaStatus === 'TRIAL') return formatDate(subscription?.trialEndsAt)
    return formatDate(subscription?.assinaturaEndsAt || subscription?.latestBillingAt)
  }, [subscription?.assinaturaEndsAt, subscription?.assinaturaStatus, subscription?.latestBillingAt, subscription?.trialEndsAt])

  const managementHint = useMemo(() => {
    if (!subscription) return 'Carregando dados financeiros.'
    if (subscription.canCancel) return 'Sua assinatura esta ativa e pronta para cancelamento imediato.'
    if (subscription.checkoutRequired) return 'Ainda falta ativar o plano na AbacatePay para liberar a recorrencia.'
    if (subscription.assinaturaStatus === 'CANCELADA') return 'A recorrencia foi encerrada. Voce pode contratar novamente quando quiser.'
    if (!subscription.abacatepaySubscriptionId && subscription.hasConfirmedBilling) {
      return 'Pagamento confirmado. Aguardando sincronizacao completa da assinatura para liberar gerenciamento.'
    }
    return 'Seu plano esta sincronizado com a cobranca recorrente.'
  }, [subscription])

  async function handleCheckout() {
    setCreatingPlan(ACTIVE_PLAN_KEY)
    setFeedback('')

    try {
      const response = await fetch('/api/assinatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: ACTIVE_PLAN_KEY }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao criar checkout.')
      }

      window.location.href = data.checkoutUrl
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao criar checkout.')
      setCreatingPlan(null)
    }
  }

  async function handleCancel() {
    if (!subscription?.canCancel || cancelling) return

    const confirmed = window.confirm('Cancelar a assinatura agora? Nenhuma nova cobranca sera gerada e essa acao e irreversivel.')
    if (!confirmed) return

    setCancelling(true)
    setFeedback('')

    try {
      const response = await fetch('/api/assinatura', { method: 'DELETE' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel cancelar a assinatura.')
      }

      setFeedback(data.message || 'Assinatura cancelada com sucesso.')
      await fetchSubscription()
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Nao foi possivel cancelar a assinatura.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="app-layout" data-page-id="assinatura">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Assinatura</h1>
            <p className="page-subtitle">Centralize plano, recorrencia, historico financeiro e acoes da AbacatePay.</p>
          </div>
        </div>

        {feedback ? (
          <div className="panel-muted" style={{ marginBottom: 16 }}>
            {feedback}
          </div>
        ) : null}

        {loading ? <div className="dashboard-card__empty">Carregando assinatura...</div> : null}

        {!loading && subscription ? (
          <>
            <section className={`card subscription-hero subscription-hero--${heroTone}`} style={{ maxWidth: 900 }}>
              <div className="subscription-hero__icon">{subscription.assinaturaStatus === 'ATIVA' ? 'OK' : 'FIN'}</div>
              <div className="subscription-hero__content">
                <div className="subscription-hero__title">
                  Plano {formatPlanLabel(subscription.plano)} - {statusLabel}
                </div>
                <div className="subscription-hero__subtitle">
                  Proxima referencia: {nextReference}
                  {subscription.abacatepayCustomerId ? ' | cliente conectado' : ' | cliente pendente'}
                </div>
              </div>
              <span className={getBadgeClass(heroTone)}>{statusLabel}</span>
            </section>

            <section className="billing-summary-grid" style={{ maxWidth: 900 }}>
              <article className="analytics-card">
                <div className="card-title">Plano atual</div>
                <div className="metric-value" style={{ fontSize: 30, marginTop: 6 }}>
                  {formatMoney(currentPlan.priceCents / 100)}
                </div>
                <div className="section-title__hint">{currentPlan.marketingDescription}</div>
              </article>

              <article className="analytics-card">
                <div className="card-title">Estado da cobranca</div>
                <div className="metric-value" style={{ fontSize: 22, marginTop: 6 }}>
                  {subscription.latestBillingStatus || 'Sem evento'}
                </div>
                <div className="section-title__hint">
                  {subscription.latestBillingAt ? `Ultima atualizacao em ${formatDate(subscription.latestBillingAt)}` : 'Nenhum evento financeiro sincronizado ainda.'}
                </div>
              </article>

              <article className="analytics-card">
                <div className="card-title">Gerenciamento</div>
                <div className="metric-value" style={{ fontSize: 22, marginTop: 6 }}>
                  {subscription.abacatepaySubscriptionId ? 'Liberado' : 'Em sincronizacao'}
                </div>
                <div className="section-title__hint">{managementHint}</div>
              </article>
            </section>

            <section className="billing-actions-grid" style={{ maxWidth: 900 }}>
              <article className="card">
                <div className="card-title">Acoes da assinatura</div>
                <p className="section-title__hint" style={{ marginBottom: 14 }}>
                  {managementHint}
                </p>

                <div className="billing-actions-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!subscription.canCreateCheckout || !billingConfigured || Boolean(creatingPlan)}
                    onClick={() => handleCheckout()}
                  >
                    {creatingPlan ? 'Abrindo checkout...' : subscription.assinaturaStatus === 'CANCELADA' ? 'Reativar plano' : 'Ativar plano'}
                  </button>

                  <button
                    type="button"
                    className="btn"
                    style={{ color: '#A32D2D', borderColor: '#A32D2D' }}
                    disabled={!subscription.canCancel || cancelling}
                    onClick={handleCancel}
                  >
                    {cancelling ? 'Cancelando...' : 'Cancelar assinatura'}
                  </button>
                </div>

                {!billingConfigured ? <div className="section-title__hint">A configuracao da AbacatePay ainda nao esta pronta no servidor.</div> : null}
                {!subscription.abacatepaySubscriptionId && subscription.hasConfirmedBilling ? (
                  <div className="section-title__hint">O pagamento entrou, mas o ID da assinatura ainda nao voltou pelo webhook. O cancelamento sera liberado assim que a sincronizacao terminar.</div>
                ) : null}
              </article>

              <article className="card">
                <div className="card-title">Plano disponivel</div>
                <p className="section-title__hint" style={{ marginBottom: 14 }}>
                  O produto opera hoje com um unico plano. Isso reduz ambiguidade de checkout, cobranca e suporte enquanto fechamos a base do financeiro.
                </p>

                <article className="plan-card featured">
                  <div className="plan-card__header">
                    <div className="plan-card__name">{currentPlan.label}</div>
                    <span className="tag tag-blue">Plano unico</span>
                  </div>
                  <div className="plan-price">
                    {formatMoney(currentPlan.priceCents / 100)}
                    <span className="plan-period">/mes</span>
                  </div>
                  <div className="plan-card__description">{currentPlan.marketingDescription}</div>
                  <ul className="plan-items">
                    {currentPlan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={!billingConfigured || Boolean(creatingPlan) || !subscription.canCreateCheckout}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleCheckout()}
                  >
                    {subscription.canCreateCheckout ? 'Ativar plano' : 'Plano ativo'}
                  </button>
                </article>
              </article>
            </section>

            <section className="card subscription-history" style={{ maxWidth: 900 }}>
              <div className="card-title">Historico financeiro</div>

              {history.length === 0 ? <div className="section-title__hint">Nenhuma cobranca registrada ainda.</div> : null}

              {history.map((item) => (
                <div key={item.id} className="integration-row">
                  <div>
                    <div>
                      {formatDate(item.createdAt)} | {item.descricao}
                    </div>
                    <div className="section-title__hint">{item.isLinkedToAbacatePay ? 'Registro conectado ao billing' : 'Registro legado ou manual'}</div>
                  </div>
                  <div className="subscription-history__row">
                    <span className="subscription-history__value">{formatMoney(item.valor)}</span>
                    <span className={getBadgeClass(item.tone)}>{item.normalizedStatus || item.status}</span>
                  </div>
                </div>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
