'use client'

import { useEffect, useMemo, useState } from 'react'

import { AnalysisResult } from '@/types'

type AnalyzeFormProps = {
  onAnalyzed?: () => void
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

  if (normalized.includes('olxpro') || normalized.includes('seminovos')) return 'OLX Pro detectado'
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
  const [sourceUrl, setSourceUrl] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({
    type: 'MOTO',
    title: '',
    description: '',
    price: '',
    mileage: '',
    year: '',
    city: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [stepIndex, setStepIndex] = useState(0)

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

  const providerLabel = useMemo(() => detectSource(sourceUrl), [sourceUrl])
  const canSubmitUrl = !!sourceUrl.trim() && /^https?:\/\//i.test(sourceUrl.trim())
  const canSubmitManual = !!manualForm.title.trim() && !!manualForm.price

  async function handleSubmit(mode: 'url' | 'manual') {
    if (mode === 'url' && !canSubmitUrl) {
      setError('Cole um link valido para analisar o anuncio automaticamente.')
      return
    }

    if (mode === 'manual' && !canSubmitManual) {
      setError('Preencha pelo menos titulo e preco para a analise manual.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    const payload =
      mode === 'url'
        ? {
            sourceUrl: sourceUrl.trim(),
          }
        : {
            type: manualForm.type,
            title: manualForm.title,
            description: manualForm.description,
            price: manualForm.price,
            mileage: manualForm.mileage,
            year: manualForm.year,
            city: manualForm.city,
          }

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao analisar anuncio.')
      }

      setResult(data.analysis)
      if (mode === 'url') setSourceUrl('')
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
      <div className="analyze-link-card">
        <div className="analyze-link-card__title">Cole o link do anuncio</div>

        <div className="analyze-link-row">
          <input
            type="url"
            placeholder="https://www.olx.com.br/... | facebook.com/marketplace/... | webmotors.com.br/..."
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmitUrl && !loading) {
                handleSubmit('url')
              }
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => handleSubmit('url')} disabled={loading || !canSubmitUrl}>
            Analisar
          </button>
        </div>

        {providerLabel ? (
          <div className="analyze-provider">
            <span>OK</span>
            <span>{providerLabel} - o sistema tenta extrair preco, km, ano e cidade automaticamente.</span>
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
          {showManual ? 'Ocultar preenchimento manual' : 'Nao tenho link - quero preencher manualmente'}
        </button>
      </div>

      {showManual ? (
        <div className="analyze-manual-card">
          <div className="analyze-manual-card__title">Preenchimento manual</div>

          <div className="form-grid form-grid--2" style={{ marginBottom: 10 }}>
            <div>
              <label className="form-label">Tipo</label>
              <select value={manualForm.type} onChange={(event) => setManualForm({ ...manualForm, type: event.target.value })}>
                <option value="MOTO">Moto</option>
                <option value="CARRO">Carro</option>
              </select>
            </div>

            <div>
              <label className="form-label">Cidade / Estado</label>
              <input
                type="text"
                placeholder="Campinas SP"
                value={manualForm.city}
                onChange={(event) => setManualForm({ ...manualForm, city: event.target.value })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label className="form-label">Titulo do anuncio</label>
            <input
              type="text"
              placeholder="Honda XRE 300 2021"
              value={manualForm.title}
              onChange={(event) => setManualForm({ ...manualForm, title: event.target.value })}
            />
          </div>

          <div className="form-grid form-grid--3" style={{ marginBottom: 10 }}>
            <div>
              <label className="form-label">Preco pedido (R$)</label>
              <input
                type="number"
                placeholder="21900"
                value={manualForm.price}
                onChange={(event) => setManualForm({ ...manualForm, price: event.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Quilometragem</label>
              <input
                type="number"
                placeholder="38000"
                value={manualForm.mileage}
                onChange={(event) => setManualForm({ ...manualForm, mileage: event.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Ano</label>
              <input
                type="number"
                placeholder="2021"
                value={manualForm.year}
                onChange={(event) => setManualForm({ ...manualForm, year: event.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Descricao do anuncio</label>
            <textarea
              rows={4}
              placeholder="Cole aqui o titulo e a descricao completa do anuncio."
              value={manualForm.description}
              onChange={(event) => setManualForm({ ...manualForm, description: event.target.value })}
              style={{ resize: 'vertical' }}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary analyze-form__submit"
            style={{ marginTop: 14 }}
            onClick={() => handleSubmit('manual')}
            disabled={loading || !canSubmitManual}
          >
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
              <div className="analyze-form__loading-copy">Analisando o anuncio e montando o resumo da oportunidade.</div>
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
