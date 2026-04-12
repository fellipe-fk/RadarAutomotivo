import Link from 'next/link'
import type { ReactNode } from 'react'

type ModuleCardProps = {
  title: string
  description?: string
  href?: string
  id?: string
  badge?: string
  children?: ReactNode
}

export function ModuleCard({ title, description, href, id, badge, children }: ModuleCardProps) {
  return (
    <article className="system-card" id={id}>
      <div className="system-card__head">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {description ? <p style={{ margin: '4px 0 0', color: '#666' }}>{description}</p> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badge ? <span className="badge">{badge}</span> : null}
          {href ? (
            <Link className="btn" href={href} prefetch={false}>
              Abrir
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </article>
  )
}
