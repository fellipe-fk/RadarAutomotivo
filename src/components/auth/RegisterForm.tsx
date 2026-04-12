'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

type PlanType = 'BASICO' | 'PRO' | 'AGENCIA'

const plans: { value: PlanType; label: string; price: string }[] = [
  { value: 'BASICO', label: 'Basico', price: 'R$ 97' },
  { value: 'PRO', label: 'Pro', price: 'R$ 197' },
  { value: 'AGENCIA', label: 'Agencia', price: 'R$ 497' },
]

export default function RegisterForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    city: '',
    state: '',
    plano: 'PRO' as PlanType,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
        body: JSON.stringify(form),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel criar a conta.')
      }

      window.location.assign('/dashboard')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Falha ao cadastrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <div className="auth-copy">
          <span className="marketing-pill marketing-pill--dark">Teste gratis por 7 dias</span>
          <h1>Criar conta</h1>
          <p>Abra sua operacao no RadarAuto com um fluxo pronto para evoluir do prototipo ao produto real.</p>
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
            <label className="form-label">Plano inicial</label>
            <div className="auth-plan-grid">
              {plans.map((plan) => (
                <button
                  key={plan.value}
                  type="button"
                  className={`auth-plan ${form.plano === plan.value ? 'is-selected' : ''}`}
                  onClick={() => setForm((current) => ({ ...current, plano: plan.value }))}
                >
                  <strong>{plan.label}</strong>
                  <span>{plan.price}</span>
                </button>
              ))}
            </div>
          </div>

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta'}
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
