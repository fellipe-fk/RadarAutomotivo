'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'
import { Listing } from '@/types'

import AnalyzeForm from './AnalyzeForm'

function formatRelativeTime(value?: string) {
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

function scoreColor(score: number) {
  if (score >= 75) return '#639922'
  if (score >= 50) return '#BA7517'
  return '#A32D2D'
}

export default function AnalyzePageClient() {
  const [recentListings, setRecentListings] = useState<Listing[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)

  async function fetchRecent() {
    setLoadingRecent(true)

    try {
      const response = await fetch('/api/listings?status=ANALYZED')
      const data = await response.json()

      setRecentListings((data.listings || []).slice(0, 6))
    } catch (error) {
      console.error(error)
      setRecentListings([])
    } finally {
      setLoadingRecent(false)
    }
  }

  useEffect(() => {
    fetchRecent()
  }, [])

  const sessionHistory = useMemo(() => {
    return recentListings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      source: listing.source.toUpperCase(),
      createdAt: formatRelativeTime(listing.createdAt),
      score: listing.opportunityScore ?? 0,
      color: scoreColor(listing.opportunityScore ?? 0),
    }))
  }, [recentListings])

  return (
    <div className="app-layout" data-page-id="analisar">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Analisar anuncio</h1>
            <p className="page-subtitle">Cole o link - a IA extrai e analisa tudo automaticamente</p>
          </div>
        </div>

        <section className="analyze-shell">
          <AnalyzeForm onAnalyzed={fetchRecent} />

          <div className="analyze-history">
            <div className="analyze-history__title">Analisados nesta sessão</div>

            {loadingRecent ? <div className="credit-footnote">Carregando histórico...</div> : null}

            {!loadingRecent && sessionHistory.length === 0 ? (
              <div className="credit-footnote">Nenhum anúncio analisado ainda.</div>
            ) : null}

            <div className="analyze-history__list">
              {sessionHistory.map((item) => (
                <div key={item.id} className="analyze-history__item">
                  <div>
                    <strong>{item.title}</strong>
                    <div className="analyze-history__meta">
                      {item.source} - {item.createdAt}
                    </div>
                  </div>

                  <div className="analyze-history__score" style={{ color: item.color }}>
                    {item.score}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
