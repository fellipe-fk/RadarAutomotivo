'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { normalizarPlaca } from '@/lib/laudo'
import type { LaudoResultado } from '@/lib/laudo'

type StoredLaudo = {
  id: string
  createdAt: string
  placa: string
  scoreCompra: number | null
  situacao: string | null
  resultado: LaudoResultado | null
}

const loadingSteps = [
  'Validando placa informada...',
  'Consultando bases estaduais e federais...',
  'Conferindo debitos e restricoes...',
  'Montando score de compra...',
  'Finalizando laudo completo...',
]

function formatMoney(value: number) {
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'agora'
  }

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPlateDisplay(value: string) {
  const normalized = normalizarPlaca(value)

  if (normalized.length <= 3) {
    return normalized
  }

  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`
}

function mapHistoryItem(item: {
  id: string
  createdAt: string
  placa: string
  scoreCompra?: number | null
  situacao?: string | null
  resultado: unknown
}): StoredLaudo {
  const result =
    item.resultado &&
    typeof item.resultado === 'object' &&
    'veiculo' in item.resultado &&
    item.resultado.veiculo &&
    typeof item.resultado.veiculo === 'object' &&
    'marca' in item.resultado.veiculo
      ? (item.resultado as LaudoResultado)
      : null

  return {
    id: item.id,
    createdAt: item.createdAt,
    placa: item.placa,
    scoreCompra: typeof item.scoreCompra === 'number' ? item.scoreCompra : null,
    situacao: item.situacao || null,
    resultado: result,
  }
}

export default function LaudoPage() {
  const [plate, setPlate] = useState('')
  const [renavam, setRenavam] = useState('')
  const [credits, setCredits] = useState(0)
  const [history, setHistory] = useState<StoredLaudo[]>([])
  const [selectedResult, setSelectedResult] = useState<StoredLaudo | null>(null)
  const [loading, setLoading] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [profileResponse, historyResponse] = await Promise.all([
          fetch('/api/auth/me', { credentials: 'same-origin' }),
          fetch('/api/laudo', { credentials: 'same-origin' }),
        ])

        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          setCredits(profileData.user?.creditosLaudo ?? 0)
        }

        if (historyResponse.ok) {
          const historyData = await historyResponse.json()
          const items = (historyData.items || []).map(mapHistoryItem)

          setHistory(items)
          setSelectedResult((current) => current || items.find((item) => item.resultado?.veiculo) || items[0] || null)
        }
      } catch (fetchError) {
        console.error(fetchError)
      }
    }

    loadInitialData()
  }, [])

  useEffect(() => {
    if (!loading) {
      setStepIndex(0)
      return
    }

    const interval = setInterval(() => {
      setStepIndex((current) => (current < loadingSteps.length - 1 ? current + 1 : current))
    }, 650)

    return () => clearInterval(interval)
  }, [loading])

  const progress = ((stepIndex + 1) / loadingSteps.length) * 100

  const result = selectedResult?.resultado
  const vehicle = result?.veiculo
  const restrictions = result?.restricoes
  const debits = result?.debitos
  const totalDebits = (debits?.ipva.valor || 0) + (debits?.licenciamento.valor || 0) + (debits?.multas.valor_total || 0)

  const scoreTone = useMemo(() => {
    const score = selectedResult?.scoreCompra ?? result?.score_compra ?? 0

    if (score >= 75) {
      return { background: '#EAF3DE', color: '#27500A' }
    }

    if (score >= 50) {
      return { background: '#FAEEDA', color: '#633806' }
    }

    return { background: '#FCEBEB', color: '#791F1F' }
  }, [result?.score_compra, selectedResult?.scoreCompra])

  const statusClass =
    (selectedResult?.situacao || result?.situacao_geral) === 'Regular'
      ? 'laudo-status-ok'
      : (selectedResult?.situacao || result?.situacao_geral) === 'Atencao'
        ? 'laudo-status-warn'
        : 'laudo-status-bad'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const normalizedPlate = normalizarPlaca(plate)

    if (normalizedPlate.length !== 7) {
      setError('Digite uma placa valida com 7 caracteres.')
      return
    }

    setLoading(true)
    setSelectedResult(null)

    const startedAt = Date.now()

    try {
      const response = await fetch('/api/laudo', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: normalizedPlate,
          renavam,
        }),
      })

      const data = await response.json()
      const elapsed = Date.now() - startedAt

      if (elapsed < 1600) {
        await new Promise((resolve) => setTimeout(resolve, 1600 - elapsed))
      }

      if (!response.ok) {
        setError(
          response.status === 401
            ? 'Sua sessao expirou ou nao foi enviada no pedido. Atualize a pagina e tente de novo.'
            : data.error || 'Nao foi possivel consultar o laudo agora.'
        )
        return
      }

      const createdLaudo = mapHistoryItem(data.laudo)
            setCredits(data.remainingCredits ?? 0)
      setSelectedResult(createdLaudo)
      setHistory((current) => [createdLaudo, ...current.filter((item) => item.id !== createdLaudo.id)].slice(0, 8))
      setPlate(formatPlateDisplay(createdLaudo.placa))
    } catch (requestError) {
      console.error(requestError)
      setError('Erro inesperado ao consultar o laudo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-layout" data-page-id="laudo">
      <Sidebar />

      <main className="main-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Laudo veicular</h1>
            <p className="page-subtitle">Consulte o historico completo de qualquer veiculo pela placa.</p>
          </div>

          <div className="page-header__actions">
            <div className="credit-chip">
              <span>Creditos:</span>
              <strong>{credits}</strong>
            </div>
            <Link href="/assinatura" prefetch={false} className="btn btn-primary">
              Comprar creditos
            </Link>
          </div>
        </header>

        <div className="laudo-layout">
          <div>
            <section className="card laudo-entry-card">
              <div className="laudo-entry-title">Digite a placa do veiculo</div>

              <form onSubmit={handleSubmit}>
                <input
                  className="placa-input"
                  maxLength={8}
                  placeholder="ABC-1D23"
                  value={plate}
                  onChange={(event) => setPlate(formatPlateDisplay(event.target.value))}
                />

                <div className="tag-list" style={{ marginTop: 10 }}>
                  <span className="tag">Placa antiga</span>
                  <span className="tag">Mercosul</span>
                </div>

                <div className="form-group" style={{ marginTop: 14 }}>
                  <label className="form-label">RENAVAM (opcional)</label>
                  <input value={renavam} onChange={(event) => setRenavam(event.target.value)} />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                  Consultar laudo completo - R$ 19
                </button>
              </form>

              <div className="credit-hint">1 credito sera debitado da sua conta e o resultado fica disponivel por 24h.</div>
            </section>

            <div className="history-title">Consultas recentes</div>

            <div className="history-list">
              {history.length > 0 ? (
                history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="history-card"
                    onClick={() => {
                      setSelectedResult(item)
                      setPlate(formatPlateDisplay(item.placa))
                      setError('')
                    }}
                  >
                    <div>
                      <div className="history-card__title">
                        {item.resultado?.veiculo
                          ? `${item.resultado.veiculo.marca} ${item.resultado.veiculo.modelo} ${item.resultado.veiculo.ano_mod}`
                          : 'Consulta sem dados completos'}
                      </div>
                      <div className="history-card__meta">
                        {formatPlateDisplay(item.placa)} · {formatDateTime(item.createdAt)}
                      </div>
                    </div>
                    <div className="history-score">{item.scoreCompra ?? '--'}</div>
                  </button>
                ))
              ) : (
                <div className="credit-footnote">Nenhuma consulta realizada ainda.</div>
              )}
            </div>
          </div>

          <div>
            {error ? <div className="card laudo-debit-warning">{error}</div> : null}

            {loading ? (
              <section className="card">
                <div className="laudo-loading-title">Consultando placa {formatPlateDisplay(plate)}...</div>
                <div className="laudo-loading-steps">
                  {loadingSteps.map((step, index) => (
                    <div key={step} className={index <= stepIndex ? 'calc-pos' : ''}>
                      {step}
                    </div>
                  ))}
                </div>
                <div className="laudo-progress">
                  <div className="laudo-progress__bar" style={{ width: `${progress}%` }} />
                </div>
              </section>
            ) : null}

            {!loading && result && vehicle ? (
              <section className="card">
                <div className="laudo-header">
                  <div>
                    <div className="laudo-vehicle-title">
                      {vehicle.marca} {vehicle.modelo} {vehicle.versao}
                    </div>
                    <div className="laudo-vehicle-meta">
                      Placa: {formatPlateDisplay(selectedResult?.placa || vehicle.placa)} · RENAVAM: {vehicle.renavam} · Chassi:{' '}
                      {vehicle.chassi}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div className="laudo-score-box" style={scoreTone}>
                      <div className="laudo-score-box__label" style={{ color: scoreTone.color }}>
                        Score de compra
                      </div>
                      <div className="laudo-score-box__value" style={{ color: scoreTone.color }}>
                        {result.score_compra}
                      </div>
                    </div>
                    <span className={`laudo-status-badge ${statusClass}`}>{selectedResult?.situacao || result.situacao_geral}</span>
                  </div>
                </div>

                <div className="panel-muted" style={{ marginBottom: 14 }}>
                  <strong style={{ display: 'block', marginBottom: 8 }}>Parecer do sistema</strong>
                  <div className="calc-market-copy">{result.parecer}</div>
                </div>

                {totalDebits > 0 ? (
                  <div className="laudo-debit-warning">
                    <strong>Debitos pendentes: {formatMoney(totalDebits)}</strong>
                    <div className="calc-market-copy">
                      Quitar antes da transferencia para evitar custo extra no fechamento da compra.
                    </div>
                  </div>
                ) : null}

                <div className="laudo-grid">
                  <div className="card-subsection">
                    <div className="section-title">Dados do veiculo</div>
                    <div className="laudo-row">
                      <span>Tipo</span>
                      <strong>{vehicle.tipo}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>Ano fab./mod.</span>
                      <strong>
                        {vehicle.ano_fab}/{vehicle.ano_mod}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Cor</span>
                      <strong>{vehicle.cor}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>Combustivel</span>
                      <strong>{vehicle.combustivel}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>Potencia</span>
                      <strong>{vehicle.potencia}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>Cilindradas</span>
                      <strong>{vehicle.cilindradas}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>Municipio / UF</span>
                      <strong>
                        {vehicle.municipio} - {vehicle.uf}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Numero de proprietarios</span>
                      <strong>{vehicle.num_proprietarios}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>Tabela FIPE</span>
                      <strong>{formatMoney(vehicle.fipe_valor)}</strong>
                    </div>
                  </div>

                  <div className="card-subsection">
                    <div className="section-title">Restricoes e ocorrencias</div>
                    <div className="laudo-row">
                      <span>Roubo / Furto</span>
                      <strong className={restrictions?.roubo_furto.status === 'Negativo' ? 'calc-pos' : 'calc-neg'}>
                        {restrictions?.roubo_furto.status}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Leilao</span>
                      <strong className={restrictions?.leilao.status === 'Negativo' ? 'calc-pos' : 'calc-neg'}>
                        {restrictions?.leilao.status}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Sinistro</span>
                      <strong className={restrictions?.sinistro.status === 'Negativo' ? 'calc-pos' : 'calc-neg'}>
                        {restrictions?.sinistro.status}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Gravame</span>
                      <strong className={restrictions?.gravame.status === 'Negativo' ? 'calc-pos' : 'calc-neg'}>
                        {restrictions?.gravame.status}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Restricao administrativa</span>
                      <strong className={restrictions?.restricao_administrativa.status === 'Negativo' ? 'calc-pos' : 'calc-neg'}>
                        {restrictions?.restricao_administrativa.status}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Restricao judicial</span>
                      <strong className={restrictions?.restricao_judicial.status === 'Negativo' ? 'calc-pos' : 'calc-neg'}>
                        {restrictions?.restricao_judicial.status}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Comunicacao de venda</span>
                      <strong className={restrictions?.comunicacao_venda.status === 'Negativo' ? 'calc-pos' : 'calc-neg'}>
                        {restrictions?.comunicacao_venda.status}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="laudo-grid" style={{ marginTop: 14 }}>
                  <div className="card-subsection">
                    <div className="section-title">Debitos e documentacao</div>
                    <div className="laudo-row">
                      <span>IPVA {debits?.ipva.ano}</span>
                      <strong>{debits?.ipva.situacao === 'Pendente' ? formatMoney(debits.ipva.valor) : debits?.ipva.situacao}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>Licenciamento</span>
                      <strong>
                        {debits?.licenciamento.situacao === 'Pendente'
                          ? formatMoney(debits.licenciamento.valor)
                          : debits?.licenciamento.situacao}
                      </strong>
                    </div>
                    <div className="laudo-row">
                      <span>Multas ({debits?.multas.quantidade || 0})</span>
                      <strong>{debits?.multas.quantidade ? formatMoney(debits.multas.valor_total) : 'Em dia'}</strong>
                    </div>
                    <div className="laudo-row">
                      <span>DPVAT / SPVAT</span>
                      <strong>{debits?.dpvat.situacao}</strong>
                    </div>
                  </div>

                  <div className="card-subsection">
                    <div className="section-title">Recall e informacoes extras</div>
                    <div className={`laudo-status-badge ${result.recall.ativo ? 'laudo-status-warn' : 'laudo-status-ok'}`}>
                      {result.recall.ativo ? 'Recall pendente' : 'Sem recall ativo'}
                    </div>
                    <div className="calc-market-copy" style={{ marginTop: 10 }}>
                      {result.recall.ativo
                        ? `${result.recall.campanha} - ${result.recall.descricao}`
                        : 'Nenhuma campanha de recall ativa para este veiculo.'}
                    </div>
                    <div className="credit-footnote" style={{ marginTop: 12 }}>
                      Consulta realizada em {formatDateTime(selectedResult?.createdAt || new Date().toISOString())}
                    </div>
                    <div className="credit-footnote">Origem dos dados: {result.origem}</div>
                    <div className="credit-footnote">Laudo valido por 24 horas.</div>
                  </div>
                </div>

                <div className="page-header__actions" style={{ marginTop: 14 }}>
                  <Link
                    href={`/calculadora?price=${vehicle.fipe_valor}&vehicle=${encodeURIComponent(
                      `${vehicle.marca} ${vehicle.modelo} ${vehicle.ano_mod}`
                    )}`}
                    prefetch={false}
                    className="btn btn-primary"
                  >
                    Calcular margem de revenda
                  </Link>
                  <a href="/analisar" className="btn">
                    Analisar anuncio deste veiculo
                  </a>
                </div>

                <div className="credit-footnote" style={{ marginTop: 12 }}>
                  Este laudo e gerado com base em dados publicos e nao substitui vistoria cautelar presencial.
                </div>
              </section>
            ) : null}

            {!loading && selectedResult && !vehicle && !error ? (
              <section className="card">
                <div className="laudo-loading-title">Consulta antiga sem estrutura completa</div>
                <div className="calc-market-copy">
                  Este registro foi salvo num formato anterior e nao consegue abrir o resumo completo. Faca uma nova
                  consulta para gerar o laudo no formato atual.
                </div>
              </section>
            ) : null}

            {!loading && !result && !error ? (
              <section className="card">
                <div className="laudo-loading-title">Nenhum laudo aberto no momento</div>
                <div className="calc-market-copy">
                  Digite uma placa valida para gerar um laudo completo com score, debitos, restricoes e FIPE.
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}
