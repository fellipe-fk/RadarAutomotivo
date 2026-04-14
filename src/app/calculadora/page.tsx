'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'

type FormState = {
  purchasePrice: string
  vehicle: string
  distance: string
  fuelPrice: string
  reviewCost: string
  transferCost: string
  otherCosts: string
  targetMargin: string
}

const DEFAULT_FORM: FormState = {
  purchasePrice: '',
  vehicle: '',
  distance: '38',
  fuelPrice: '6.29',
  reviewCost: '400',
  transferCost: '250',
  otherCosts: '0',
  targetMargin: '12',
}

function toNumber(value: string) {
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number) {
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace('.', ',')}%`
}

function calculateMonthlyInstallment(principal: number, monthlyRate: number, months: number) {
  if (principal <= 0) return 0

  const factor = Math.pow(1 + monthlyRate, months)
  return principal * ((monthlyRate * factor) / (factor - 1))
}

export default function CalculadoraPage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [consumoKmL, setConsumoKmL] = useState(12)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const queryPrice = params.get('price')
    const queryVehicle = params.get('vehicle')

    if (!queryPrice && !queryVehicle) return

    setForm((current) => ({
      ...current,
      purchasePrice: queryPrice && Number(queryPrice) > 0 ? queryPrice : current.purchasePrice,
      vehicle: queryVehicle?.trim() ? queryVehicle : current.vehicle,
    }))
  }, [])

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      try {
        const response = await fetch('/api/auth/me')

        if (response.ok) {
          const profileData = await response.json()
          const consumo = Number(profileData.user?.consumoKmL)

          if (Number.isFinite(consumo) && consumo > 0) {
            setConsumoKmL(consumo)
          }
        }
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const calculations = useMemo(() => {
    const purchasePrice = toNumber(form.purchasePrice)
    const distance = toNumber(form.distance)
    const fuelPrice = toNumber(form.fuelPrice)
    const reviewCost = toNumber(form.reviewCost)
    const transferCost = toNumber(form.transferCost)
    const otherCosts = toNumber(form.otherCosts)
    const targetMargin = toNumber(form.targetMargin) || 12

    const travelCost = ((distance * 2) / consumoKmL) * fuelPrice
    const totalCost = purchasePrice + travelCost + reviewCost + transferCost + otherCosts
    const minimumPrice = totalCost * (1 + targetMargin / 100)
    const recommendedPrice = totalCost * 1.2
    const premiumPrice = totalCost * 1.26
    const estimatedProfit = recommendedPrice - totalCost
    const marginPercent = totalCost > 0 ? (estimatedProfit / totalCost) * 100 : 0

    return {
      purchasePrice,
      distance,
      fuelPrice,
      reviewCost,
      transferCost,
      otherCosts,
      targetMargin,
      travelCost,
      totalCost,
      minimumPrice,
      recommendedPrice,
      premiumPrice,
      estimatedProfit,
      marginPercent,
    }
  }, [consumoKmL, form])

  const financingScenarios = useMemo(() => {
    const sellingPrice = calculations.recommendedPrice
    const monthlyRate = 0.0219

    return [
      { entryPercent: 20, months: 48 },
      { entryPercent: 30, months: 36 },
      { entryPercent: 40, months: 24 },
    ].map((scenario) => {
      const entryValue = sellingPrice * (scenario.entryPercent / 100)
      const financedValue = Math.max(0, sellingPrice - entryValue)

      return {
        ...scenario,
        entryValue,
        monthlyInstallment: calculateMonthlyInstallment(financedValue, monthlyRate, scenario.months),
      }
    })
  }, [calculations.recommendedPrice])

  return (
    <div className="app-layout" data-page-id="calculadora">
      <Sidebar />

      <main className="main-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Calculadora de precificação</h1>
            <p className="page-subtitle">Simule a margem de revenda e o melhor preço de venda</p>
          </div>
        </header>

        <div className="calculator-layout">
          <section className="card calculator-card">
            <div className="card-title">Dados da compra</div>

            <div className="form-group">
              <label className="form-label">Preço de compra (R$)</label>
              <input
                type="number"
                value={form.purchasePrice}
                onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Veículo</label>
              <input value={form.vehicle} onChange={(event) => setForm({ ...form, vehicle: event.target.value })} />
            </div>

            <div className="form-grid form-grid--2">
              <div className="form-group">
                <label className="form-label">Distância (km)</label>
                <input
                  type="number"
                  value={form.distance}
                  onChange={(event) => setForm({ ...form, distance: event.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Combustível (R$/L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.fuelPrice}
                  onChange={(event) => setForm({ ...form, fuelPrice: event.target.value })}
                />
              </div>
            </div>

            <div className="form-grid form-grid--2">
              <div className="form-group">
                <label className="form-label">Revisão estimada (R$)</label>
                <input
                  type="number"
                  value={form.reviewCost}
                  onChange={(event) => setForm({ ...form, reviewCost: event.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Transferência + DETRAN</label>
                <input
                  type="number"
                  value={form.transferCost}
                  onChange={(event) => setForm({ ...form, transferCost: event.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Outros custos (R$)</label>
              <input
                type="number"
                value={form.otherCosts}
                onChange={(event) => setForm({ ...form, otherCosts: event.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Margem mínima desejada (%)</label>
              <input
                type="number"
                value={form.targetMargin}
                onChange={(event) => setForm({ ...form, targetMargin: event.target.value })}
              />
            </div>
          </section>

          <div className="calc-card-stack">
            <section className="card calculator-card">
              <div className="card-title">Resultado</div>

              <div className="calc-result">
                <div className="calc-row">
                  <span>Preço de compra</span>
                  <strong>{formatMoney(calculations.purchasePrice)}</strong>
                </div>
                <div className="calc-row">
                  <span>Deslocamento ({Math.round(calculations.distance)} km)</span>
                  <strong className="calc-neg">- {formatMoney(calculations.travelCost)}</strong>
                </div>
                <div className="calc-row">
                  <span>Revisão e limpeza</span>
                  <strong className="calc-neg">- {formatMoney(calculations.reviewCost)}</strong>
                </div>
                <div className="calc-row">
                  <span>Transferência e taxas</span>
                  <strong className="calc-neg">- {formatMoney(calculations.transferCost)}</strong>
                </div>
                {calculations.otherCosts > 0 ? (
                  <div className="calc-row">
                    <span>Outros custos</span>
                    <strong className="calc-neg">- {formatMoney(calculations.otherCosts)}</strong>
                  </div>
                ) : null}
                <div className="calc-row">
                  <span>Custo total</span>
                  <strong>{formatMoney(calculations.totalCost)}</strong>
                </div>
              </div>

              <div className="metric-grid metric-grid--3" style={{ marginTop: 14 }}>
                <article className="metric-card">
                  <p className="metric-label">Preço mínimo</p>
                  <div className="metric-value">{formatMoney(calculations.minimumPrice)}</div>
                  <p className="metric-sub">{calculations.targetMargin}% de margem alvo</p>
                </article>
                <article className="metric-card">
                  <p className="metric-label">Preço recomendado</p>
                  <div className="metric-value">{formatMoney(calculations.recommendedPrice)}</div>
                  <p className="metric-sub">Faixa para giro com boa competitividade</p>
                </article>
                <article className="metric-card">
                  <p className="metric-label">Preço premium</p>
                  <div className="metric-value">{formatMoney(calculations.premiumPrice)}</div>
                  <p className="metric-sub">Se o carro estiver acima da média local</p>
                </article>
              </div>

              <div className="panel-muted" style={{ marginTop: 14 }}>
                <div className="calc-row">
                  <span>Lucro estimado na venda recomendada</span>
                  <strong className={calculations.estimatedProfit >= 0 ? 'calc-pos' : 'calc-neg'}>
                    {formatMoney(calculations.estimatedProfit)}
                  </strong>
                </div>
                <div className="calc-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                  <span>Margem bruta estimada</span>
                  <strong>{formatPercent(calculations.marginPercent)}</strong>
                </div>
              </div>
            </section>

            <section className="card calculator-card">
              <div className="card-title">Simulador de financiamento para o comprador</div>

              {financingScenarios.map((scenario) => (
                <div key={`${scenario.entryPercent}-${scenario.months}`} className="mini-card" style={{ marginBottom: 10 }}>
                  <strong>
                    Venda por {formatMoney(calculations.recommendedPrice)} · Entrada {scenario.entryPercent}%
                  </strong>
                  <div>{formatMoney(scenario.entryValue)} de entrada</div>
                  <span>
                    {scenario.months}x de {formatMoney(scenario.monthlyInstallment)} com taxa média de 2,19% a.m.
                  </span>
                </div>
              ))}

              <div className="calc-market-copy">
                Use este bloco para testar se o preço sugerido continua financiável para o perfil de cliente que você costuma
                atender.
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
