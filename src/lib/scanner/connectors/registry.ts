import { icarrosConnector } from './icarros'
import { kavakConnector } from './kavak'
import { mercadoLivreConnector } from './mercadolivre'
import { olxConnector } from './olx'
import { webmotorsConnector } from './webmotors'
import type { SourceConnector } from './types'

const registry = {
  icarros: icarrosConnector,
  kavak: kavakConnector,
  mercadolivre: mercadoLivreConnector,
  olx: olxConnector,
  webmotors: webmotorsConnector,
} as const satisfies Record<string, SourceConnector>

const SOURCE_ALIASES: Record<string, keyof typeof registry> = {
  icarros: 'icarros',
  kavak: 'kavak',
  'mercado livre': 'mercadolivre',
  mercadolivre: 'mercadolivre',
  olx: 'olx',
  'olx pro': 'olx',
  olxpro: 'olx',
  webmotors: 'webmotors',
}

export const connectorRegistry = registry

export type RegisteredConnectorSource = keyof typeof connectorRegistry

export function normalizeConnectorSource(source: string) {
  const normalized = source.toLowerCase().trim()
  return SOURCE_ALIASES[normalized] || null
}

export function getConnector(source: string) {
  const normalized = normalizeConnectorSource(source)
  return normalized ? connectorRegistry[normalized] : null
}

export function resolveConnectors(sources: string[]) {
  const resolved = new Map<RegisteredConnectorSource, SourceConnector>()

  for (const source of sources) {
    const normalized = normalizeConnectorSource(source)
    if (!normalized) continue
    resolved.set(normalized, connectorRegistry[normalized])
  }

  return Array.from(resolved.values())
}

export function listConnectors() {
  return Object.values(connectorRegistry)
}
