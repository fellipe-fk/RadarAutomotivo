'use client'

import { useEffect, useMemo, useState } from 'react'

import Sidebar from '@/components/ui/Sidebar'

type ProfileUser = {
  id: string
  name: string
  email: string
  phone?: string | null
  city?: string | null
  state?: string | null
  plano: string
  assinaturaStatus: string
  trialEndsAt?: string | null
  creditosLaudo: number
  raioKm: number
  consumoKmL: number
  emailAlertas: boolean
  whatsappEnabled: boolean
  telegramEnabled: boolean
  silencioNoturno: boolean
  margemMinima: number
  focoTipo: string
  telegramChatId?: string | null
}

type ProfileUiState = {
  document: string
  documentType: 'PF' | 'PJ'
  address: string
  zipCode: string
  priceDropAlerts: boolean
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type SystemStatus = {
  aiProvider: string
  aiConfigured: boolean
}

const defaultUiState: ProfileUiState = {
  document: '',
  documentType: 'PF',
  address: '',
  zipCode: '',
  priceDropAlerts: true,
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

export default function PerfilPage() {
  const [form, setForm] = useState<ProfileUser | null>(null)
  const [ui, setUi] = useState<ProfileUiState>(defaultUiState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    async function fetchUser() {
      try {
        const [userResponse, statusResponse] = await Promise.all([fetch('/api/auth/me'), fetch('/api/system/status')])
        const userData = await userResponse.json()
        const statusData = await statusResponse.json()

        setForm(userData.user || null)
        setSystemStatus({
          aiProvider: statusData.aiProvider || 'OpenAI',
          aiConfigured: !!statusData.aiConfigured,
        })
      } catch (error) {
        console.error(error)
        setFeedback('Nao foi possivel carregar seu perfil agora.')
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  const initials = useMemo(() => {
    if (!form?.name) return 'RA'
    return form.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }, [form?.name])

  async function saveProfile() {
    if (!form) return

    setSaving(true)
    setFeedback('')

    try {
      const response = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || '',
          city: form.city || '',
          state: form.state || '',
          raioKm: form.raioKm,
          consumoKmL: form.consumoKmL,
          emailAlertas: form.emailAlertas,
          whatsappEnabled: form.whatsappEnabled,
          telegramEnabled: form.telegramEnabled,
          silencioNoturno: form.silencioNoturno,
          margemMinima: form.margemMinima,
          focoTipo: form.focoTipo,
          telegramChatId: form.telegramChatId || '',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao salvar alteracoes.')
      }

      setForm(data.user)
      setFeedback('Perfil atualizado com sucesso.')
    } catch (error) {
      console.error(error)
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar alteracoes.')
    } finally {
      setSaving(false)
    }
  }

  function updatePassword() {
    if (!ui.currentPassword || !ui.newPassword || !ui.confirmPassword) {
      setFeedback('Preencha os tres campos de senha para continuar.')
      return
    }

    if (ui.newPassword !== ui.confirmPassword) {
      setFeedback('A confirmacao da nova senha nao confere.')
      return
    }

    setUi((current) => ({
      ...current,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }))
    setFeedback('Fluxo de troca de senha preparado para a integracao final.')
  }

  function exportData() {
    if (!form) return

    const payload = {
      profile: {
        name: form.name,
        email: form.email,
        phone: form.phone,
        city: form.city,
        state: form.state,
        plano: form.plano,
        assinaturaStatus: form.assinaturaStatus,
      },
      preferences: {
        raioKm: form.raioKm,
        consumoKmL: form.consumoKmL,
        margemMinima: form.margemMinima,
        focoTipo: form.focoTipo,
        emailAlertas: form.emailAlertas,
        whatsappEnabled: form.whatsappEnabled,
        telegramEnabled: form.telegramEnabled,
        silencioNoturno: form.silencioNoturno,
      },
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'radarauto-perfil.json'
    link.click()
    window.URL.revokeObjectURL(url)
    setFeedback('Dados exportados em JSON.')
  }

  function requestDeleteAccount() {
    if (window.confirm('Tem certeza? Esta acao ainda vai passar por confirmacao final.')) {
      setFeedback('Solicitacao de exclusao registrada. Vou manter a conta intacta ate o fluxo final ser conectado.')
    }
  }

  async function handleLogout() {
    if (loggingOut) return

    setLoggingOut(true)

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
    } catch (error) {
      console.error(error)
    } finally {
      window.location.assign('/login')
    }
  }

  if (loading) {
    return (
      <div className="app-layout" data-page-id="perfil">
        <Sidebar />
        <main className="main-content">
          <div className="dashboard-card__empty">Carregando perfil...</div>
        </main>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="app-layout" data-page-id="perfil">
        <Sidebar />
        <main className="main-content">
          <div className="dashboard-card__empty">Nao foi possivel abrir o perfil.</div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-layout" data-page-id="perfil">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Perfil e configuracoes</h1>
            <p className="page-subtitle">Personalize sua conta e preferencias</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? 'Saindo...' : 'Sair do sistema'}
            </button>
            <button type="button" className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar alteracoes'}
            </button>
          </div>
        </div>

        {feedback ? <div className="panel-muted" style={{ marginBottom: 16 }}>{feedback}</div> : null}

        <div className="profile-grid" style={{ maxWidth: 860 }}>
          <div>
            <section className="card">
              <div className="profile-section">
                <div className="profile-section-title">Dados pessoais</div>
                <div className="avatar-big">{initials}</div>

                <div className="form-group">
                  <label className="form-label">Nome completo</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((current) => (current ? { ...current, name: event.target.value } : current))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" value={form.email} disabled />
                </div>

                <div className="form-group">
                  <label className="form-label">WhatsApp</label>
                  <input
                    type="text"
                    value={form.phone || ''}
                    placeholder="(11) 99999-0000"
                    onChange={(event) => setForm((current) => (current ? { ...current, phone: event.target.value } : current))}
                  />
                </div>

                <div className="form-grid form-grid--2">
                  <div>
                    <label className="form-label">CPF / CNPJ</label>
                    <input
                      type="text"
                      value={ui.document}
                      placeholder="000.000.000-00"
                      onChange={(event) => setUi((current) => ({ ...current, document: event.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="form-label">Tipo</label>
                    <select
                      value={ui.documentType}
                      onChange={(event) =>
                        setUi((current) => ({ ...current, documentType: event.target.value as ProfileUiState['documentType'] }))
                      }
                    >
                      <option value="PF">Pessoa Fisica</option>
                      <option value="PJ">Pessoa Juridica</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="profile-section-title">Localizacao base</div>

              <div className="form-group">
                <label className="form-label">Endereco / Bairro</label>
                <input
                  type="text"
                  value={ui.address}
                  placeholder="Rua das Flores, 123 - Centro"
                  onChange={(event) => setUi((current) => ({ ...current, address: event.target.value }))}
                />
              </div>

              <div className="form-grid form-grid--2">
                <div>
                  <label className="form-label">Cidade</label>
                  <input
                    type="text"
                    value={form.city || ''}
                    onChange={(event) => setForm((current) => (current ? { ...current, city: event.target.value } : current))}
                  />
                </div>

                <div>
                  <label className="form-label">Estado</label>
                  <select
                    value={form.state || 'SP'}
                    onChange={(event) => setForm((current) => (current ? { ...current, state: event.target.value } : current))}
                  >
                    {['SP', 'MG', 'RJ', 'PR', 'RS', 'SC', 'GO', 'DF', 'BA', 'CE'].map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CEP</label>
                <input
                  type="text"
                  value={ui.zipCode}
                  placeholder="12900-000"
                  onChange={(event) => setUi((current) => ({ ...current, zipCode: event.target.value }))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Raio de atuacao (km)</label>
                <input
                  type="number"
                  value={form.raioKm}
                  onChange={(event) =>
                    setForm((current) => (current ? { ...current, raioKm: Number(event.target.value) || 0 } : current))
                  }
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: '10px 14px',
                  background: '#E6F1FB',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#0C447C',
                }}
              >
                Localizacao usada para calcular distancia ate os anuncios e apoiar a rota no Google Maps.
              </div>
            </section>
          </div>

          <div>
            <section className="card">
              <div className="profile-section-title">Preferencias do radar</div>

              <div className="form-group">
                <label className="form-label">Margem minima desejada (R$)</label>
                <input
                  type="number"
                  value={form.margemMinima}
                  onChange={(event) =>
                    setForm((current) => (current ? { ...current, margemMinima: Number(event.target.value) || 0 } : current))
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Foco principal</label>
                <select
                  value={form.focoTipo}
                  onChange={(event) => setForm((current) => (current ? { ...current, focoTipo: event.target.value } : current))}
                >
                  <option value="TODOS">Motos e carros</option>
                  <option value="MOTO">Somente motos</option>
                  <option value="CARRO">Somente carros</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Consumo medio do seu veiculo (km/L)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.consumoKmL}
                  onChange={(event) =>
                    setForm((current) => (current ? { ...current, consumoKmL: Number(event.target.value) || 0 } : current))
                  }
                />
              </div>

              <div className="toggle-wrap">
                <div className="toggle-label">
                  Receber relatorio semanal por email
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={form.emailAlertas}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, emailAlertas: event.target.checked } : current))
                    }
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="toggle-wrap">
                <div className="toggle-label">
                  Modo noturno (silenciar 22h-7h)
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={form.silencioNoturno}
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, silencioNoturno: event.target.checked } : current))
                    }
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="toggle-wrap">
                <div className="toggle-label">
                  Alertar queda de preco em favoritos
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={ui.priceDropAlerts}
                    onChange={(event) => setUi((current) => ({ ...current, priceDropAlerts: event.target.checked }))}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

            </section>

            <section className="card">
              <div className="profile-section-title">Seguranca</div>

              <div className="form-group">
                <label className="form-label">Senha atual</label>
                <input
                  type="password"
                  value={ui.currentPassword}
                  placeholder="********"
                  onChange={(event) => setUi((current) => ({ ...current, currentPassword: event.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nova senha</label>
                <input
                  type="password"
                  value={ui.newPassword}
                  placeholder="********"
                  onChange={(event) => setUi((current) => ({ ...current, newPassword: event.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirmar nova senha</label>
                <input
                  type="password"
                  value={ui.confirmPassword}
                  placeholder="********"
                  onChange={(event) => setUi((current) => ({ ...current, confirmPassword: event.target.value }))}
                />
              </div>

              <button type="button" className="btn btn-sm" onClick={updatePassword}>
                Atualizar senha
              </button>
            </section>

            <section className="card" style={{ borderColor: '#85B7EB' }}>
              <div className="profile-section-title" style={{ color: '#185FA5' }}>
                IA do sistema
              </div>

              <div style={{ fontSize: 12, color: '#666', marginBottom: 12, lineHeight: 1.6 }}>
                A analise agora usa a chave central do servidor. A administracao da conta fica em{' '}
                <a href="https://platform.openai.com/" target="_blank" rel="noreferrer" style={{ color: '#185FA5' }}>
                  platform.openai.com
                </a>
                .
              </div>

              <div className="panel-muted" style={{ marginBottom: 14 }}>
                {systemStatus?.aiConfigured
                  ? `${systemStatus.aiProvider} conectada no servidor para todas as analises do sistema.`
                  : 'A chave da IA do sistema ainda nao foi configurada no servidor.'}
              </div>

              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                Nenhuma chave sensivel fica mais salva no navegador. O backend faz a leitura do link e envia os dados para a IA com a conta oficial do sistema.
              </div>
            </section>

            <section className="card" style={{ borderColor: '#f09595' }}>
              <div className="profile-section-title" style={{ color: '#A32D2D' }}>
                Zona de perigo
              </div>

              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                Estas acoes sao sensiveis. A exclusao definitiva entra na integracao final.
              </div>

              <div className="page-header__actions">
                <button type="button" className="btn btn-sm" style={{ color: '#A32D2D', borderColor: '#A32D2D' }} onClick={exportData}>
                  Exportar meus dados
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ color: '#A32D2D', borderColor: '#A32D2D' }}
                  onClick={requestDeleteAccount}
                >
                  Excluir conta
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
