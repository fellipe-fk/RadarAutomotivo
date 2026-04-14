'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'

type UserProfile = {
  emailAlertas: boolean
  whatsappEnabled: boolean
  telegramEnabled: boolean
  assinaturaStatus: string
}

type SystemStatus = {
  telegramConfigured: boolean
  whatsappConfigured: boolean
  fipeConfigured: boolean
  asaasConfigured: boolean
  emailConfigured: boolean
  mapsConfigured: boolean
  laudoConfigured: boolean
  laudoProviderName: string
}

export default function IntegracoesPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        const [userResponse, statusResponse] = await Promise.all([fetch('/api/auth/me'), fetch('/api/system/status')])
        const userData = await userResponse.json()
        const statusData = await statusResponse.json()
        setUser(userData.user || null)
        setSystem(statusData)
      } catch (error) {
        console.error(error)
        setUser(null)
        setSystem(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  const integrations = useMemo(
    () => [
      {
        icon: 'TG',
        name: 'Telegram Bot',
        description: 'Alertas no seu grupo ou canal quando surge oportunidade.',
        on: !!system?.telegramConfigured && !!user?.telegramEnabled,
        action: system?.telegramConfigured ? 'Configurar' : 'Servidor',
      },
      {
        icon: 'WA',
        name: 'WhatsApp Business',
        description: 'Alertas via numero conectado na sua operacao.',
        on: !!system?.whatsappConfigured && !!user?.whatsappEnabled,
        action: system?.whatsappConfigured ? 'Conectar' : 'Servidor',
      },
      { icon: 'WH', name: 'Webhook personalizado', description: 'Envie alertas para qualquer sistema via POST.', on: false, action: 'Em breve' },
      {
        icon: 'FI',
        name: 'Tabela FIPE',
        description: 'Comparacao automatica de precos com a referencia oficial.',
        on: !!system?.fipeConfigured,
        action: system?.fipeConfigured ? 'Configurado' : 'Servidor',
      },
      {
        icon: 'GM',
        name: 'Google Maps',
        description: 'Rota automatica ate o anuncio e calculo de distancia.',
        on: !!system?.mapsConfigured,
        action: system?.mapsConfigured ? 'Ativo' : 'Em breve',
      },
      {
        icon: 'AS',
        name: 'Asaas cobranca',
        description: 'Gestao de assinatura, cobrancas e cancelamentos.',
        on: !!system?.asaasConfigured && user?.assinaturaStatus !== 'ENCERRADA',
        action: system?.asaasConfigured ? 'Configurado' : 'Servidor',
      },
      {
        icon: 'EM',
        name: 'Email SMTP',
        description: 'Resumo semanal e alertas por email.',
        on: !!system?.emailConfigured && !!user?.emailAlertas,
        action: system?.emailConfigured ? 'Configurar' : 'Em breve',
      },
      {
        icon: 'DV',
        name: 'Consulta de debitos',
        description: system?.laudoConfigured
          ? `Laudo veicular ligado a ${system.laudoProviderName}.`
          : 'Consulta multas, recall e restricoes pelo RENAVAM.',
        on: !!system?.laudoConfigured,
        action: system?.laudoConfigured ? 'Servidor' : 'Configurar',
      },
    ],
    [
      system?.asaasConfigured,
      system?.emailConfigured,
      system?.fipeConfigured,
      system?.laudoConfigured,
      system?.laudoProviderName,
      system?.mapsConfigured,
      system?.telegramConfigured,
      system?.whatsappConfigured,
      user?.assinaturaStatus,
      user?.emailAlertas,
      user?.telegramEnabled,
      user?.whatsappEnabled,
    ]
  )

  return (
    <div className="app-layout" data-page-id="integracoes">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Integracoes</h1>
            <p className="page-subtitle">Conecte o RadarAuto as suas ferramentas</p>
          </div>
        </div>

        {loading ? <div className="dashboard-card__empty">Carregando integracoes...</div> : null}

        <div className="integration-stack">
          {integrations.map((integration) => (
            <div key={integration.name} className="int-card">
              <div className="int-icon">{integration.icon}</div>
              <div className="int-info">
                <div className="int-name">{integration.name}</div>
                <div className="int-desc">{integration.description}</div>
              </div>
              <div className={`status-pill ${integration.on ? 'on' : 'off'}`}>
                <div className={`status-dot ${integration.on ? 'on' : 'off'}`} />
                {integration.on ? 'Ativo' : 'Inativo'}
              </div>
              <button type="button" className="btn btn-sm">
                {integration.action}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
