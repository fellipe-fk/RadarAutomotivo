export interface OpportunityScoring {
  opportunityScore: number
  riskScore: number
  confidenceScore: number
  estimatedMarginAmount: number | null
  estimatedMarginPercent: number | null
  reasons: string[]
  riskReasons: string[]
}
