'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { ACTIVE_PLAN_KEY, formatPlanLabel, type PlanKey } from '@/lib/plans'

type CheckoutState = {
  plan: PlanKey
  name: string
  email: string
  phone: string
  checkout: {
    status: string
    amount: number
  }
}

function isSuccessfulSubscriptionStatus(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase()
  return normalized === 'PAID' || normalized === 'ACTIVE' || normalized === 'COMPLETED'
}

function formatMoney(value: number) {
  return `R$ ${(value / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function RegisterForm() {
  const searchParams = useSearchParams()
  const checkoutToken = searchParams.get('checkoutToken') || ''
  const [checkoutState, setCheckoutState] = useState<CheckoutState | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(Boolean(checkoutToken))
  const [checkoutError, setCheckoutError] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    city: '',
    state: '',
    plano: ACTIVE_PLAN_KEY as PlanKey,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function loadCheckout() {
      if (!checkoutToken) {
        setCheckoutLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/public-checkout/status?checkoutToken=${encodeURIComponent(checkoutToken)}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Nao foi possivel validar seu checkout.')
        }

        if (!active) return

        setCheckoutState(data)
        setForm((current) => ({
          ...current,
          name: data.name || current.name,
          email: data.email || current.email,
          phone: data.phone || current.phone,
          plano: data.plan || current.plano,
        }))
      } catch (checkoutLoadError) {
        if (!active) return
        setCheckoutError(checkoutLoadError instanceof Error ? checkoutLoadError.message : 'Falha ao validar checkout.')
      } finally {
        if (active) {
          setCheckoutLoading(false)
        }
      }
    }

    loadCheckout()

    return () => {
      active = false
    }
  }, [checkoutToken])

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: field === 'state' ? value.toUpperCase().slice(0, 2) : value,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...form,
          checkoutToken,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel criar a conta.')
      }

      window.location.assign('/dashboard?welcome=1')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Falha ao cadastrar.')
    } finally {
      setLoading(false)
    }
  }

  const planCopy = useMemo(() => `Plano ${formatPlanLabel(form.plano)}`, [form.plano])

  if (!checkoutToken) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-copy">
            <span className="marketing-pill marketing-pill--dark">Etapa 2 de 3</span>
            <h1>Finalize o checkout primeiro</h1>
            <p>Para este teste o cadastro so abre depois do pagamento no checkout da AbacatePay.</p>
          </div>

          <div className="panel-muted" style={{ marginBottom: 18 }}>
            O fluxo correto agora e: escolher o plano, pagar no checkout, ver a confirmacao e so depois criar o acesso.
          </div>

          <Link href="/checkout?plan=PRO" className="btn btn-primary auth-submit">
            Ir para o checkout
          </Link>

          <div className="auth-footer">
            <span>Ja tem conta?</span>
            <Link href="/login">Entrar</Link>
          </div>
        </div>
      </div>
    )
  }

  if (checkoutLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="dashboard-card__empty">Validando o checkout...</div>
        </div>
      </div>
    )
  }

  if (checkoutError || !isSuccessfulSubscriptionStatus(checkoutState?.checkout.status)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-copy">
            <span className="marketing-pill marketing-pill--dark">Etapa 2 de 3</span>
            <h1>Checkout ainda nao confirmado</h1>
            <p>Assim que o pagamento estiver como pago, liberamos a criacao da conta.</p>
          </div>

          <div className="auth-error" style={{ marginBottom: 18 }}>
            {checkoutError || `Status atual: ${checkoutState?.checkout.status || 'desconhecido'}`}
          </div>

          <Link href={`/checkout?plan=${checkoutState?.plan || 'PRO'}`} className="btn btn-primary auth-submit">
            Voltar ao checkout
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <div className="auth-copy">
          <span className="marketing-pill marketing-pill--dark">Etapa 3 de 3</span>
          <h1>Criar acesso ao sistema</h1>
          <p>Pagamento confirmado. Agora crie seu acesso para entrar no painel com o plano ja ativado.</p>
        </div>

        <div className="panel-muted" style={{ marginBottom: 18 }}>
          <strong>{planCopy}</strong> | {formatMoney(checkoutState.checkout.amount)} | status {checkoutState.checkout.status}
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-grid form-grid--2">
            <div>
              <label className="form-label" htmlFor="register-name">
                Nome completo
              </label>
              <input
                id="register-name"
                type="text"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Seu nome"
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="register-email">
                Email
              </label>
              <input
                id="register-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="voce@exemplo.com"
                required
              />
            </div>
          </div>

          <div className="form-grid form-grid--2">
            <div>
              <label className="form-label" htmlFor="register-phone">
                WhatsApp
              </label>
              <input
                id="register-phone"
                type="text"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="(11) 99999-0000"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="register-password">
                Senha
              </label>
              <input
                id="register-password"
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder="Minimo 8 caracteres"
                required
              />
            </div>
          </div>

          <div className="form-grid form-grid--2">
            <div>
              <label className="form-label" htmlFor="register-city">
                Cidade
              </label>
              <input
                id="register-city"
                type="text"
                value={form.city}
                onChange={(event) => updateField('city', event.target.value)}
                placeholder="Campinas"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="register-state">
                UF
              </label>
              <input
                id="register-state"
                type="text"
                value={form.state}
                onChange={(event) => updateField('state', event.target.value)}
                placeholder="SP"
                maxLength={2}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Plano liberado</label>
            <div className="auth-plan-grid">
              <div className="auth-plan is-selected">
                <strong>{planCopy}</strong>
                <span>{formatMoney(checkoutState.checkout.amount)}</span>
                <small style={{ display: 'block', marginTop: 8, color: '#6c7785' }}>
                  Sua conta vai nascer com este plano ja validado pelo checkout.
                </small>
              </div>
            </div>
          </div>

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Criando acesso...' : 'Criar conta e entrar'}
          </button>
        </form>

        <div className="auth-footer">
          <span>Quer rever o pagamento?</span>
          <Link href={`/checkout/sucesso?checkoutToken=${encodeURIComponent(checkoutToken)}`}>Voltar para a confirmacao</Link>
        </div>
      </div>
    </div>
  )
}
