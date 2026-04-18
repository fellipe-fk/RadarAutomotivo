'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'

import { ACTIVE_PLAN_KEY, getPlanInfo } from '@/lib/plans'

type PublicCheckoutFormProps = {
  initialPlan?: string
}

export default function PublicCheckoutForm({ initialPlan = ACTIVE_PLAN_KEY }: PublicCheckoutFormProps) {
  const plan = ACTIVE_PLAN_KEY
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const details = useMemo(() => getPlanInfo(initialPlan), [initialPlan])

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/public-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          plan,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel abrir o checkout.')
      }

      window.location.assign(data.checkoutUrl)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Falha ao abrir o checkout.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <div className="auth-copy">
          <span className="marketing-pill marketing-pill--dark">Etapa 1 de 3</span>
          <h1>Checkout do plano</h1>
          <p>Escolha validada. Agora abrimos o checkout da AbacatePay e so depois liberamos o cadastro.</p>
        </div>

        <div className="marketing-card marketing-card--plan is-featured" style={{ marginBottom: 18 }}>
          <div className="marketing-plan__top">
            <strong>{details.label}</strong>
            <span className="badge">Plano unico</span>
          </div>
          <div className="marketing-plan__price">{`R$ ${(details.priceCents / 100).toLocaleString('pt-BR')}`}</div>
          <p>{details.marketingDescription}</p>
          <ul className="marketing-list">
            {details.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-grid form-grid--2">
            <div>
              <label className="form-label" htmlFor="checkout-name">
                Nome completo
              </label>
              <input
                id="checkout-name"
                type="text"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Seu nome"
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="checkout-email">
                Email do pagador
              </label>
              <input
                id="checkout-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="voce@exemplo.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="checkout-phone">
              WhatsApp
            </label>
            <input
              id="checkout-phone"
              type="text"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              placeholder="(11) 99999-0000"
            />
          </div>

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Abrindo checkout...' : 'Ir para o checkout'}
          </button>
        </form>

        <div className="auth-footer">
          <span>Ja tem conta?</span>
          <Link href="/login">Entrar</Link>
        </div>
      </div>
    </div>
  )
}
