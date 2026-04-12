'use client'

import { useEffect, useMemo, useState } from 'react'

import { AnalysisResult } from '@/types'

type AnalyzeFormProps = {
  onAnalyzed?: () => void
}

type SystemStatus = {
  aiProvider: string
  aiConfigured: boolean
}

const acceptedSources = ['OLX', 'Facebook', 'Webmotors', 'iCarros', 'Mercado Livre', 'Kavak']
const analysisSteps = [
  'Acessando o anuncio...',
  'Extraindo titulo, preco, km e ano...',
  'Comparando com FIPE e media local...',
  'Verificando sinais de risco...',
  'Calculando score e margem estimada...',
]

function detectSource(url: string) {
  const normalized = url.toLowerCase()

  if (normalized.includes('olx')) return 'OLX detectado'
  if (normalized.includes('facebook')) return 'Facebook Marketplace detectado'
  if (normalized.includes('webmotors')) return 'Webmotors detectado'
  if (normalized.includes('icarros')) return 'iCarros detectado'
  if (normalized.includes('mercadolivre')) return 'Mercado Livre detectado'
  if (normalized.includes('kavak')) return 'Kavak detectado'

  return ''
}

function scoreColor(score: number) {
  if (score >= 75) return '#639922'
  if (score >= 50) return '#BA7517'
  return '#A32D2D'
}

export default function AnalyzeForm({ onAnalyzed }: AnalyzeFormProps) {
  const [form, setForm] = useState({
    type: 'MOTO',
    title: '',
    description: '',
    price: '',
    mileage: '',
    year: '',
    city: '',
    sourceUrl: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    async function fetchSystemStatus() {
      try {
        const response = await fetch('/api/system/status')
        const data = await response.json()

        if (response.ok) {
          setSystemStatus({
            aiProvider: data.aiProvider || 'OpenAI',
            aiConfigured: !!data.aiConfigured,
          })
        } else {
          setSystemStatus({ aiProvider: 'OpenAI', aiConfigured: false })
        }
      } catch (fetchError) {
        console.error(fetchError)
        setSystemStatus({ aiProvider: 'OpenAI', aiConfigured: false })
      }
    }

    fetchSystemStatus()
  }, [])

  useEffect(() => {
    if (!loading) {
      setStepIndex(0)
      return
    }

    const timer = window.setInterval(() => {
      setStepIndex((current) => (current < analysisSteps.length - 1 ? current + 1 : current))
    }, 700)

    return () => window.clearInterval(timer)
  }, [loading])

  const providerLabel = useMemo(() => detectSource(form.sourceUrl), [form.sourceUrl])

  async function handleSubmit() {
    if (!systemStatus?.aiConfigured) {
      setError('A IA do sistema ainda nao foi configurada no servidor.')
      return
    }

    if (!form.sourceUrl && !form.title && !form.description) {
      setError('Cole o link do anuncio ou descreva manualmente os dados principais.')
      return
    }

    if (!form.sourceUrl && !form.price) {
      setError('No preenchimento manual, informe o preco pedido para calcular score e margem.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao analisar anuncio.')
      }

      setResult(data.analysis)
      onAnalyzed?.()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao analisar anuncio.')
    } finally {
      setLoading(false)
    }
  }

  const oppColor = result ? scoreColor(result.score_oportunidade) : '#aaa'
  const riskColor = result?.nivel_risco === 'Baixo' ? '#639922' : result?.nivel_risco === 'Medio' ? '#BA7517' : '#A32D2D'

  return (
    <div className="analyze-form">
      {systemStatus?.aiConfigured === false ? (
        <div className="analyze-warning">
          <strong>IA do sistema indisponivel</strong> no momento. Configure a chave da OpenAI no servidor para ativar a analise.
          <div className="analyze-warning__hint">Assim que a chave do sistema estiver ativa, este formulario passa a ler e enriquecer o link automaticamente.</div>
        </div>
      ) : (
        <div className="panel-muted" style={{ marginBottom: 16 }}>
          {systemStatus
            ? `${systemStatus.aiProvider} conectada no servidor. O link do anuncio sera lido no backend antes da analise.`
            : 'Validando conexao com a IA do sistema...'}
        </div>
      )}

      <div className="analyze-link-card">
        <div className="analyze-link-card__title">Cole o link do anuncio</div>

        <div className="analyze-link-row">
          <input
            type="url"
            placeholder="https://www.olx.com.br/... | facebook.com/marketplace/... | webmotors.com.br/..."
            value={form.sourceUrl}
            onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
          />
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading || !form.sourceUrl}>
            Analisar
          </button>
        </div>

        <div className="form-grid form-grid--2" style={{ marginBottom: providerLabel ? 10 : 0 }}>
          <div>
            <label className="form-label">Tipo</label>
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="MOTO">Moto</option>
              <option value="CARRO">Carro</option>
            </select>
          </div>

          <div>
            <label className="form-label">Preco pedido (R$)</label>
            <input
              type="number"
              placeholder="21900"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
          </div>
        </div>

        {providerLabel ? (
          <div className="analyze-provider">
            <span>OK</span>
            <span>{providerLabel}</span>
            <span className="analyze-provider__hint">- o servidor vai extrair os dados reais da pagina antes da IA montar o parecer.</span>
          </div>
        ) : null}

        <div className="analyze-accepted">
          <span className="analyze-accepted__label">Aceita links de:</span>
          {acceptedSources.map((source) => (
            <span key={source} className="tag tag-blue">
              {source}
            </span>
          ))}
        </div>
      </div>

      <div className="analyze-manual-toggle">
        <button type="button" onClick={() => setShowManual((current) => !current)}>
          {showManual ? 'Ocultar preenchimento manual' : 'Nao tenho link - quero descrever manualmente'}
        </button>
      </div>

      {showManual ? (
        <div className="analyze-manual-card">
          <div className="analyze-manual-card__title">Preencher manualmente</div>

          <div className="form-grid form-grid--2" style={{ marginBottom: 10 }}>
            <div>
              <label className="form-label">Titulo do anuncio</label>
              <input
                type="text"
                placeholder="Honda XRE 300 2021"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Cidade / Estado</label>
              <input
                type="text"
                placeholder="Campinas SP"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </div>
          </div>

          <div className="form-grid form-grid--3" style={{ marginBottom: 10 }}>
            <div>
              <label className="form-label">Ano</label>
              <input
                type="number"
                placeholder="2021"
                value={form.year}
                onChange={(event) => setForm({ ...form, year: event.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Quilometragem</label>
              <input
                type="number"
                placeholder="38000"
                value={form.mileage}
                onChange={(event) => setForm({ ...form, mileage: event.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Preco pedido (R$)</label>
              <input
                type="number"
                placeholder="21900"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Descricao do anuncio</label>
            <textarea
              rows={4}
              placeholder="Cole aqui o titulo e a descricao completa do anuncio."
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              style={{ resize: 'vertical' }}
            />
          </div>

          <button type="button" className="btn btn-primary analyze-form__submit" style={{ marginTop: 14 }} onClick={handleSubmit} disabled={loading}>
            Analisar com IA
          </button>
        </div>
      ) : null}

      {error ? <div className="analyze-form__error">{error}</div> : null}

      {loading ? (
        <div className="analyze-form__loading">
          <div className="analyze-form__loading-head">
            <div className="analyze-form__dots">
              <span className="analyze-form__dot" />
              <span className="analyze-form__dot" />
              <span className="analyze-form__dot" />
            </div>
            <div>
              <div className="analyze-form__loading-title">{analysisSteps[stepIndex]}</div>
              <div className="analyze-form__loading-copy">O motor de analise esta lendo o anuncio e montando o resumo da oportunidade.</div>
            </div>
          </div>

          <div className="analyze-form__steps">
            {analysisSteps.map((step, index) => (
              <div key={step} className={`analyze-form__step ${index <= stepIndex ? 'is-done' : ''}`}>
                {index <= stepIndex ? '[ok]' : '[..]'} {step}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="card analyze-form__result">
          <div className="listing-card__header">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{result.titulo}</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: oppColor, fontWeight: 600 }}>Score {result.score_oportunidade}/100</div>
              <div style={{ fontSize: 12, color: riskColor }}>Risco {result.nivel_risco}</div>
            </div>
          </div>

          <div className="score-bar">
            <span className="label">Oportunidade</span>
            <div className="track">
              <div className="fill" style={{ width: `${result.score_oportunidade}%`, background: oppColor }} />
            </div>
            <span className="num" style={{ color: oppColor }}>
              {result.score_oportunidade}
            </span>
          </div>

          <div className="score-bar">
            <span className="label">Risco</span>
            <div className="track">
              <div className="fill" style={{ width: `${result.score_risco}%`, background: riskColor }} />
            </div>
            <span className="num" style={{ color: riskColor }}>
              {result.nivel_risco}
            </span>
          </div>

          <p className="listing-card__summary" style={{ marginTop: 14 }}>
            {result.resumo}
          </p>

          {result.observacao ? (
            <div className="panel-muted" style={{ marginBottom: 12 }}>
              {result.observacao}
            </div>
          ) : null}

          {result.margem_estimada ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#185FA5', marginBottom: 12 }}>
              Margem estimada: {result.margem_estimada}
            </div>
          ) : null}

          {result.sinais_positivos?.length ? (
            <div style={{ marginBottom: 8 }}>
              {result.sinais_positivos.map((signal) => (
                <span key={signal} className="tag-positive">
                  {signal}
                </span>
              ))}
            </div>
          ) : null}

          {result.sinais_alerta?.length ? (
            <div>
              {result.sinais_alerta.map((signal) => (
                <span key={signal} className="tag-alert">
                  {signal}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
