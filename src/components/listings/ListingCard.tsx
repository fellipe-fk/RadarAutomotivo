'use client'

import Link from 'next/link'
import { Listing } from '@/types'

interface Props {
  listing: Listing
  onFavorite?: (id: string, val: boolean) => void
  onDiscard?: (id: string) => void
  compact?: boolean
}

function scoreColor(score: number) {
  if (score >= 75) return '#639922'
  if (score >= 50) return '#BA7517'
  return '#A32D2D'
}

function riskColor(level?: string) {
  if (level === 'LOW') return '#639922'
  if (level === 'MEDIUM') return '#BA7517'
  return '#A32D2D'
}

function riskLabel(level?: string) {
  if (level === 'LOW') return 'Baixo'
  if (level === 'MEDIUM') return 'Medio'
  return 'Alto'
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'agora'

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'agora'

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
  if (diffMinutes < 60) return `ha ${diffMinutes} min`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `ha ${diffHours} h`

  const diffDays = Math.round(diffHours / 24)
  return `ha ${diffDays} dia${diffDays > 1 ? 's' : ''}`
}

function formatAlertError(error?: string | null) {
  if (!error) return null
  return error.replace(/^Suprimido:\s*/i, '')
}

export default function ListingCard({ listing, onFavorite, onDiscard, compact }: Props) {
  const opportunityScore = listing.opportunityScore ?? 0
  const opportunityColor = scoreColor(opportunityScore)
  const riskColorValue = riskColor(listing.riskLevel)
  const riskLabelValue = riskLabel(listing.riskLevel)
  const riskScore = listing.riskScore ?? 0
  const distanceKm = typeof listing.distanceKm === 'number' ? listing.distanceKm : null
  const mileage = typeof listing.mileage === 'number' ? listing.mileage : null
  const estimatedMargin = typeof listing.estimatedMargin === 'number' ? listing.estimatedMargin : null
  const fipeDiscount =
    listing.fipePrice && listing.fipePrice > listing.price
      ? Math.round((1 - listing.price / listing.fipePrice) * 100)
      : 0
  const isRadarMatch = opportunityScore >= 75
  const mediaLabel = listing.type === 'MOTO' ? 'Moto' : 'Carro'
  const mediaImage = listing.imageUrls?.[0]
  const latestAlertReason = formatAlertError(listing.latestAlert?.errorMsg)
  const suppressedAlert = Boolean(listing.latestAlert && !listing.latestAlert.sent && latestAlertReason)

  return (
    <article className={`listing-card ${isRadarMatch ? 'listing-card--match' : ''}`}>
      <div className="listing-card__layout">
        <div className="listing-card__media">
          {mediaImage ? (
            <img src={mediaImage} alt={listing.title} className="listing-card__image" />
          ) : (
            <div className="listing-card__media-fallback">{mediaLabel}</div>
          )}

          {fipeDiscount > 0 ? <span className="listing-card__flag">-{fipeDiscount}% FIPE</span> : null}
          {isRadarMatch ? <span className="listing-card__flag listing-card__flag--success">Radar</span> : null}
        </div>

        <div className="listing-card__content">
          <div className="listing-card__header">
            <div>
              <h3 className="listing-card__title">{listing.title}</h3>
              <div className="listing-card__badges">
                <span className="badge">{listing.type === 'MOTO' ? 'Moto' : 'Carro'}</span>
                <span className="badge badge--muted">{listing.source.toUpperCase()}</span>
                {listing.alertSent ? <span className="badge badge--success">Alerta enviado</span> : null}
                {!listing.alertSent && suppressedAlert ? <span className="badge">Alerta segurado</span> : null}
                {listing.isFavorite ? <span className="badge badge--purple">Favorito</span> : null}
              </div>
            </div>

            <div className="listing-card__price-block">
              <div className="listing-card__price">R$ {listing.price.toLocaleString('pt-BR')}</div>
              {listing.fipePrice ? (
                <div className="listing-card__fipe">FIPE ~ R$ {listing.fipePrice.toLocaleString('pt-BR')}</div>
              ) : null}
            </div>
          </div>

          <div className="listing-card__meta">
            {listing.city ? <span>Cidade: {listing.city}</span> : null}
            {distanceKm !== null ? <span>Dist.: {distanceKm} km</span> : null}
            {mileage !== null ? <span>Km: {mileage.toLocaleString('pt-BR')}</span> : null}
            {listing.year ? <span>Ano: {listing.year}</span> : null}
          </div>

          <div className="score-bar">
            <span className="label">Oportunidade</span>
            <div className="track">
              <div className="fill" style={{ width: `${opportunityScore}%`, background: opportunityColor }} />
            </div>
            <span className="num" style={{ color: opportunityColor }}>
              {opportunityScore}
            </span>
          </div>

          <div className="score-bar">
            <span className="label">Risco</span>
            <div className="track">
              <div className="fill" style={{ width: `${riskScore}%`, background: riskColorValue }} />
            </div>
            <span className="num" style={{ color: riskColorValue }}>
              {riskLabelValue}
            </span>
          </div>
        </div>
      </div>

      <div className="listing-card__bottom">
        <div className="listing-card__summary">
          {listing.aiSummary || 'Sem resumo de IA disponivel para este anuncio ainda.'}
          {estimatedMargin !== null ? (
            <span className="listing-card__margin"> Margem est.: R$ {estimatedMargin.toLocaleString('pt-BR')}</span>
          ) : null}
        </div>

        {listing.positiveSignals?.length ? (
          <div className="listing-card__signals">
            {listing.positiveSignals.map((signal, index) => (
              <span key={index} className="tag-positive">
                {signal}
              </span>
            ))}
            {listing.alertSignals?.map((signal, index) => (
              <span key={index} className="tag-alert">
                {signal}
              </span>
            ))}
          </div>
        ) : null}

        {!listing.alertSent && suppressedAlert ? (
          <div className="panel-muted" style={{ marginBottom: 0 }}>
            <strong>Alerta nao enviado automaticamente.</strong> {latestAlertReason}
            <div className="section-title__hint" style={{ marginTop: 6 }}>
              Ultima decisao {formatRelativeTime(listing.latestAlert?.createdAt)}
            </div>
          </div>
        ) : null}

        {!compact ? (
          <div className="listing-card__footer">
            <div className="listing-card__actions">
              <button
                className="btn btn-sm"
                onClick={() => onFavorite?.(listing.id, !listing.isFavorite)}
                title={listing.isFavorite ? 'Remover favorito' : 'Favoritar'}
              >
                {listing.isFavorite ? 'Salvar' : 'Favoritar'}
              </button>

              <button className="btn btn-sm" onClick={() => onDiscard?.(listing.id)} title="Descartar">
                Descartar
              </button>

              {listing.sourceUrl ? (
                <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                  Ver anuncio
                </a>
              ) : null}

              <a href="/analisar" className="btn btn-sm btn-primary">
                Analisar
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}
