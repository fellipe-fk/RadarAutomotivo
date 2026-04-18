'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { formatPlanLabel, type PlanKey } from '@/lib/plans'

type CheckoutStatusPayload = {
  plan: PlanKey
  name: string
  email: string
  phone: string
  checkout: {
    id: string
    status: string
    amount: number
    paidAmount: number
  }
}

function formatMoney(value: number) {
  return `R$ ${(value / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

type CheckoutSuccessClientProps = {
  checkoutToken?: string
}

function isSuccessfulSubscriptionStatus(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase()
  return normalized === 'PAID' || normalized === 'ACTIVE' || normalized === 'COMPLETED'
}

export default function CheckoutSuccessClient({ checkoutToken = '' }: CheckoutSuccessClientProps) {
  const [data, setData] = useState<CheckoutStatusPayload | null>(null)
  const [loading, setLoading] = useState(Boolean(checkoutToken))
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadStatus() {
      if (!checkoutToken) {
        setLoading(false)
        setError('Token de checkout ausente.')
        return
      }

      try {
        const response = await fetch(`/api/public-checkout/status?checkoutToken=${encodeURIComponent(checkoutToken)}`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error || 'Nao foi possivel confirmar o checkout.')
        }

        if (!active) return
        setData(payload)
      } catch (statusError) {
        if (!active) return
        setError(statusError instanceof Error ? statusError.message : 'Falha ao confirmar checkout.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadStatus()

    return () => {
      active = false
    }
  }, [checkoutToken])

  const cadastroHref = useMemo(() => {
    if (!checkoutToken) return '/cadastro'
    return `/cadastro?checkoutToken=${encodeURIComponent(checkoutToken)}`
  }, [checkoutToken])

  const canContinue = isSuccessfulSubscriptionStatus(data?.checkout.status)

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <div className="auth-copy">
          <span className="marketing-pill marketing-pill--dark">Etapa 2 de 3</span>
          <h1>Pagamento confirmado</h1>
          <p>Assim que o checkout estiver pago, voce segue para criar o acesso ao sistema.</p>
        </div>

        {loading ? <div className="dashboard-card__empty">Conferindo status do checkout...</div> : null}

        {!loading && error ? <div className="auth-error">{error}</div> : null}

        {!loading && data ? (
          <>
            <div className="panel-muted" style={{ marginBottom: 18 }}>
              <strong>{`Plano ${formatPlanLabel(data.plan)}`}</strong> | {formatMoney(data.checkout.amount)} | status {data.checkout.status}
            </div>

            <div className="marketing-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 18 }}>
              <article className="marketing-card">
                <h3>Pagador</h3>
                <p>{data.name}</p>
                <p>{data.email}</p>
              </article>
              <article className="marketing-card">
                <h3>Proxima etapa</h3>
                <p>Agora vamos criar sua conta e vincular este checkout ao acesso do painel.</p>
              </article>
            </div>

            {canContinue ? (
              <Link href={cadastroHref} className="btn btn-primary auth-submit">
                Continuar para o cadastro
              </Link>
            ) : (
              <div className="panel-muted">
                O pagamento ainda nao apareceu como pago. Volte ao checkout e finalize antes de criar a conta.
              </div>
            )}
          </>
        ) : null}

        <div className="auth-footer">
          <span>Precisa voltar?</span>
          <Link href="/checkout?plan=PRO">Reabrir etapa do checkout</Link>
        </div>
      </div>
    </div>
  )
}
