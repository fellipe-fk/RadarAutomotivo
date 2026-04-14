'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

const DEMO_EMAIL = 'demo@radarauto.com.br'
const DEMO_PASSWORD = 'Radar123A'
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel entrar.')
      }

      const nextPath =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null

      window.location.assign(nextPath || '/dashboard')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Falha ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  function fillDemoAccount() {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setError('')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="marketing-pill marketing-pill--dark">Acesso ao sistema</span>
          <h1>Entrar na conta</h1>
          <p>Use seu email e senha para voltar ao painel do Radar AutoMoto IA.</p>
        </div>

        {IS_DEVELOPMENT ? (
          <div className="auth-demo">
            <strong>Conta de desenvolvimento</strong>
            <div>Email: {DEMO_EMAIL}</div>
            <div>Senha: {DEMO_PASSWORD}</div>
            <button type="button" className="btn" onClick={fillDemoAccount}>
              Preencher acesso
            </button>
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            required
          />

          <label className="form-label" htmlFor="login-password">
            Senha
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Sua senha"
            autoComplete="current-password"
            required
          />

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="auth-footer">
          <span>Ainda nao tem conta?</span>
          <Link href="/cadastro">Criar conta gratis</Link>
        </div>
      </div>
    </div>
  )
}
