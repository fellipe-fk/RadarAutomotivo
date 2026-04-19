import { listConnectors } from '../connectors/registry'

export interface ConnectorHealthStatus {
  source: string
  supportsDirectSearch: boolean
  supportsAuthenticatedSearch: boolean
  supportsManualExtraction: boolean
  ok: boolean
  details?: string
  checkedAt: string
  durationMs: number
}

export async function checkConnectorHealth() {
  const connectors = listConnectors()

  const results = await Promise.all(
    connectors.map(async (connector): Promise<ConnectorHealthStatus> => {
      const startedAt = Date.now()

      try {
        const health = connector.healthCheck ? await connector.healthCheck() : { ok: true, details: 'Sem health check especifico.' }

        return {
          source: connector.source,
          supportsDirectSearch: connector.supportsDirectSearch,
          supportsAuthenticatedSearch: connector.supportsAuthenticatedSearch,
          supportsManualExtraction: connector.supportsManualExtraction,
          ok: health.ok,
          details: health.details,
          checkedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        }
      } catch (error) {
        return {
          source: connector.source,
          supportsDirectSearch: connector.supportsDirectSearch,
          supportsAuthenticatedSearch: connector.supportsAuthenticatedSearch,
          supportsManualExtraction: connector.supportsManualExtraction,
          ok: false,
          details: error instanceof Error ? error.message : 'Falha ao validar connector.',
          checkedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        }
      }
    })
  )

  return {
    checkedAt: new Date().toISOString(),
    connectors: results,
    summary: {
      total: results.length,
      healthy: results.filter((entry) => entry.ok).length,
      unhealthy: results.filter((entry) => !entry.ok).length,
      avgDurationMs:
        results.length > 0 ? Math.round(results.reduce((total, entry) => total + entry.durationMs, 0) / results.length) : 0,
    },
  }
}
