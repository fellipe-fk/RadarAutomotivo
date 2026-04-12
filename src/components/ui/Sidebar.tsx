'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useState } from 'react'

import { formatRiskLabel } from '@/lib/radar'

type SidebarUser = {
  name: string
  plano: string
  assinaturaStatus: string
  creditosLaudo: number
}

type RadarConfig = {
  ativo?: boolean
  scoreAlerta?: number
  riscoMax?: string
}

type NavItem = {
  href: string
  label: string
  id: string
  icon: ReactNode
  badgeTone?: 'default' | 'success' | 'warning'
}

function iconNode(children: ReactNode) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {children}
    </svg>
  )
}

const primaryItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    id: 'dashboard',
    icon: iconNode(
      <>
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </>
    ),
  },
  {
    href: '/oportunidades',
    label: 'Oportunidades',
    id: 'oportunidades',
    icon: iconNode(
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3l2 2" />
      </>
    ),
  },
  {
    href: '/analisar',
    label: 'Analisar anuncio',
    id: 'analisar',
    icon: iconNode(
      <>
        <circle cx="7" cy="7" r="5" />
        <path d="M11 11l3 3" />
      </>
    ),
  },
  {
    href: '/crm',
    label: 'Meu portfolio',
    id: 'crm',
    icon: iconNode(
      <>
        <path d="M2 13V5l6-3 6 3v8" />
        <rect x="6" y="9" width="4" height="4" />
      </>
    ),
  },
  {
    href: '/calculadora',
    label: 'Calculadora',
    id: 'calculadora',
    icon: iconNode(
      <>
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <path d="M5 5h2M9 5h2M5 8h2M9 8h2M5 11h2M9 11h2" />
      </>
    ),
  },
]

const systemItems: NavItem[] = [
  {
    href: '/radar',
    label: 'Radar de busca',
    id: 'radar',
    icon: iconNode(
      <>
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="3" />
        <path d="M8 2v2M8 12v2M2 8h2M12 8h2" />
      </>
    ),
  },
  {
    href: '/analytics',
    label: 'Analytics',
    id: 'analytics',
    icon: iconNode(<path d="M2 14l3-5 3 3 3-6 3 2" />),
  },
  {
    href: '/alertas',
    label: 'Alertas',
    id: 'alertas',
    icon: iconNode(
      <>
        <path d="M8 2a5 5 0 015 5v3l1 2H2l1-2V7a5 5 0 015-5z" />
        <path d="M6.5 13.5a1.5 1.5 0 003 0" />
      </>
    ),
  },
  {
    href: '/laudo',
    label: 'Laudo veicular',
    id: 'laudo',
    badgeTone: 'warning',
    icon: iconNode(
      <>
        <rect x="2" y="1" width="12" height="14" rx="2" />
        <path d="M5 5h6M5 8h6M5 11h4" />
      </>
    ),
  },
  {
    href: '/integracoes',
    label: 'Integracoes',
    id: 'integracoes',
    icon: iconNode(
      <>
        <circle cx="4" cy="8" r="2" />
        <circle cx="12" cy="4" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 8h6M6 7l6-2M6 9l6 2" />
      </>
    ),
  },
  {
    href: '/assinatura',
    label: 'Assinatura',
    id: 'assinatura',
    icon: iconNode(
      <>
        <rect x="1" y="3" width="14" height="10" rx="2" />
        <path d="M1 7h14" />
      </>
    ),
  },
  {
    href: '/perfil',
    label: 'Perfil e config.',
    id: 'perfil',
    icon: iconNode(
      <>
        <circle cx="8" cy="5" r="3" />
        <path d="M2 14a6 6 0 0112 0" />
      </>
    ),
  },
]

function formatPlan(plano?: string) {
  if (plano === 'AGENCIA') return 'Plano Agencia'
  if (plano === 'PRO') return 'Plano Pro'
  return 'Plano Basico'
}

function formatStatus(status?: string) {
  if (status === 'ATIVA') return 'ativo'
  if (status === 'TRIAL') return 'trial'
  if (status === 'SUSPENSA') return 'suspenso'
  if (status === 'CANCELADA') return 'cancelado'
  return 'ativo'
}

export default function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<SidebarUser | null>(null)
  const [config, setConfig] = useState<RadarConfig | null>(null)
  const [opportunityCount, setOpportunityCount] = useState(0)

  useEffect(() => {
    let active = true

    async function loadSidebarData() {
      try {
        const [userResponse, alertsResponse] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/alerts'),
        ])

        if (!active) return

        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData.user || null)
        }

        if (alertsResponse.ok) {
          const alertsData = await alertsResponse.json()
          setConfig(alertsData.config || null)
          setOpportunityCount(alertsData.stats?.readyCount || 0)
        }
      } catch (error) {
        console.error(error)
      }
    }

    loadSidebarData()

    return () => {
      active = false
    }
  }, [])

  const isActive = (href: string, id: string) =>
    pathname === href || pathname === `/${id}` || pathname.startsWith(`${href}/`)

  const initials = useMemo(() => {
    const name = user?.name || 'Radar Auto'
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }, [user?.name])

  const planText = useMemo(() => {
    return `${formatPlan(user?.plano)} - ${formatStatus(user?.assinaturaStatus)}`
  }, [user?.assinaturaStatus, user?.plano])

  const radarHint = useMemo(() => {
    if (!config?.ativo) return 'Radar pausado'
    if (!config?.scoreAlerta) return 'Radar ativo'
    return `Radar ativo - score ${config.scoreAlerta}+ - risco ${formatRiskLabel(config.riscoMax)}`
  }, [config])

  function renderBadge(item: NavItem) {
    if (item.id === 'oportunidades' && opportunityCount > 0) {
      return <span className="sidebar__badge">{opportunityCount}</span>
    }

    if (item.id === 'radar') {
      return (
        <span className={config?.ativo === false ? 'sidebar__badge' : 'sidebar__badge sidebar__badge--success'}>
          {config?.ativo === false ? 'Pausado' : 'Ativo'}
        </span>
      )
    }

    if (item.id === 'laudo') {
      const className =
        item.badgeTone === 'warning'
          ? 'sidebar__badge sidebar__badge--warning'
          : item.badgeTone === 'success'
            ? 'sidebar__badge sidebar__badge--success'
            : 'sidebar__badge'

      return <span className={className}>{`${user?.creditosLaudo || 0} cr`}</span>
    }

    if (item.id === 'alertas' && config?.scoreAlerta) {
      return <span className="sidebar__badge">{`${config.scoreAlerta}+`}</span>
    }

    return null
  }

  return (
    <aside className="sidebar" aria-label="Navegacao principal">
      <div className="sidebar__logo">
        <div className="sidebar__logo-icon">R</div>
        <div className="sidebar__logo-text">
          Radar<span>Auto</span>
        </div>
      </div>

      <div className="sidebar__section">Principal</div>
      <nav className="sidebar__nav" aria-label="Menu principal">
        {primaryItems.map((item) =>
          item.id === 'analisar' ? (
            <a
              key={item.id}
              href={item.href}
              className={`sidebar__item ${isActive(item.href, item.id) ? 'is-active' : ''}`}
            >
              <span className="sidebar__icon">{item.icon}</span>
              <span>{item.label}</span>
              {renderBadge(item)}
            </a>
          ) : (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              className={`sidebar__item ${isActive(item.href, item.id) ? 'is-active' : ''}`}
            >
              <span className="sidebar__icon">{item.icon}</span>
              <span>{item.label}</span>
              {renderBadge(item)}
            </Link>
          )
        )}
      </nav>

      <div className="sidebar__section">Sistema</div>
      <nav className="sidebar__nav" aria-label="Menu do sistema">
        {systemItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            className={`sidebar__item ${isActive(item.href, item.id) ? 'is-active' : ''}`}
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span>{item.label}</span>
            {renderBadge(item)}
          </Link>
        ))}
      </nav>

      <div className="sidebar__user">
        <Link href="/perfil" prefetch={false} className="sidebar__user-card">
          <div className="sidebar__avatar">{initials || 'RA'}</div>
          <div>
            <div className="sidebar__user-name">{user?.name || 'Sua conta'}</div>
            <div className="sidebar__user-plan">{user ? planText : radarHint}</div>
          </div>
        </Link>
      </div>
    </aside>
  )
}
