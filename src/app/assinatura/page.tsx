'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'

type UserPlan = {
  plano: string
  assinaturaStatus: string
  trialEndsAt?: string | null
}

function formatPlan(plano?: string) {
  if (plano === 'AGENCIA') return 'Agencia'
  if (plano === 'PRO') return 'Pro'
  return 'Basico'
}

function buildBillingHistory() {
  const today = new Date()

  return Array.from({ length: 4 }).map((_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 7)
    return date.toLocaleDateString('pt-BR')
  })
}

export default function AssinaturaPage() {
  const [user, setUser] = useState<UserPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch('/api/auth/me')
        const data = await response.json()
        setUser(data.user || null)
      } catch (error) {
        console.error(error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  const nextBilling = useMemo(() => {
    if (user?.trialEndsAt) {
      return new Date(user.trialEndsAt).toLocaleDateString('pt-BR')
    }

    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toLocaleDateString('pt-BR')
  }, [user?.trialEndsAt])

  const plans = [
    {
      key: 'BASICO',
      label: 'Basico',
      price: 'R$ 97',
      description: 'Para compradores individuais.',
      features: ['30 analises por mes', 'Radar 1 regiao', 'Alerta Telegram', 'Score IA basico'],
    },
    {
      key: 'PRO',
      label: 'Pro',
      price: 'R$ 197',
      description: 'Para revendedores ativos.',
      features: ['Analises ilimitadas', 'Radar multi-regiao', 'WhatsApp e Telegram', 'Calculadora de revenda', 'Rota Google Maps', 'Analise de imagem IA', 'CRM basico'],
    },
    {
      key: 'AGENCIA',
      label: 'Agencia',
      price: 'R$ 497',
      description: 'Para lojistas e equipes.',
      features: ['Ate 5 usuarios', 'Multi-localidade', 'Dashboard white-label', 'Relatorios avancados', 'API de integracao', 'Suporte prioritario'],
    },
  ]

  const billingHistory = buildBillingHistory()

  return (
    <div className="app-layout" data-page-id="assinatura">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Assinatura</h1>
            <p className="page-subtitle">Gerencie seu plano e metodo de pagamento</p>
          </div>
        </div>

        {loading ? <div className="dashboard-card__empty">Carregando assinatura...</div> : null}

        {!loading ? (
          <>
            <section className="card subscription-hero" style={{ maxWidth: 600 }}>
              <div className="subscription-hero__icon">✓</div>
              <div className="subscription-hero__content">
                <div className="subscription-hero__title">
                  Plano {formatPlan(user?.plano)} - {user?.assinaturaStatus === 'TRIAL' ? 'trial' : 'ativo'}
                </div>
                <div className="subscription-hero__subtitle">
                  Proxima cobranca: {nextBilling} | R$ 197,00 | Cartao final 4521
                </div>
              </div>
              <button type="button" className="btn btn-sm">
                Gerenciar
              </button>
            </section>

            <section className="plan-cards" style={{ maxWidth: 800 }}>
              {plans.map((plan) => {
                const isCurrent = user?.plano === plan.key

                return (
                  <article key={plan.key} className={`plan-card ${isCurrent ? 'featured' : ''}`}>
                    <div className="plan-card__header">
                      <div className="plan-card__name">{plan.label}</div>
                      {isCurrent ? <span className="tag tag-blue">Seu plano</span> : null}
                    </div>
                    <div className="plan-price">
                      {plan.price}
                      <span className="plan-period">/mes</span>
                    </div>
                    <div className="plan-card__description">{plan.description}</div>
                    <ul className="plan-items">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`btn btn-sm ${isCurrent ? 'btn-primary' : ''}`}
                      disabled={isCurrent}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {isCurrent ? 'Plano atual' : plan.key === 'BASICO' ? 'Fazer downgrade' : 'Fazer upgrade'}
                    </button>
                  </article>
                )
              })}
            </section>

            <section className="card subscription-history" style={{ maxWidth: 600 }}>
              <div className="card-title">Historico de cobrancas</div>

              {billingHistory.map((date) => (
                <div key={date} className="integration-row">
                  <span>{date} | Plano Pro</span>
                  <div className="subscription-history__row">
                    <span className="subscription-history__value">R$ 197,00</span>
                    <span className="badge badge--success">Pago</span>
                  </div>
                </div>
              ))}

              <div className="page-header__actions" style={{ marginTop: 14 }}>
                <button type="button" className="btn btn-sm" style={{ color: '#A32D2D', borderColor: '#A32D2D' }}>
                  Cancelar assinatura
                </button>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
