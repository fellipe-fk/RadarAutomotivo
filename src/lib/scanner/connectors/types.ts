import type { ListingSeed } from '../contracts/listing-seed'
import type { NormalizedVehicleType } from '../contracts/normalized-listing'

export type ConnectorVehicleType = Exclude<NormalizedVehicleType, 'UNKNOWN'> | 'UNKNOWN'

export interface SearchParams {
  query?: string
  city?: string
  state?: string
  minPrice?: number
  maxPrice?: number
  minYear?: number
  maxYear?: number
  minMileage?: number
  maxMileage?: number
  brand?: string
  model?: string
  vehicleType?: ConnectorVehicleType
  limit?: number
}

export interface ConnectorHealthCheckResult {
  ok: boolean
  details?: string
}

export interface SourceConnector {
  source: string
  supportsDirectSearch: boolean
  supportsAuthenticatedSearch: boolean
  supportsManualExtraction: boolean
  search(params: SearchParams): Promise<ListingSeed[]>
  extract?(url: string): Promise<ListingSeed | null>
  healthCheck?(): Promise<ConnectorHealthCheckResult>
}

export type SourceConnectorRegistry = Record<string, SourceConnector>
