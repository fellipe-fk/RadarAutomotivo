export type PlanKey = 'PRO'
export const ACTIVE_PLAN_KEY: PlanKey = 'PRO'

export const PLAN_CATALOG: Record<
  PlanKey,
  {
    key: PlanKey
    label: string
    priceCents: number
    externalId: string
    checkoutName: string
    billingDescription: string
    marketingDescription: string
    features: string[]
  }
> = {
  PRO: {
    key: 'PRO',
    label: 'Pro',
    priceCents: 19700,
    externalId: 'radarauto-pro-mensal',
    checkoutName: 'RadarAuto Pro',
    billingDescription: 'Assinatura mensal do plano Pro do RadarAuto.',
    marketingDescription: 'Melhor equilibrio para revendedor que quer velocidade e controle.',
    features: ['Analises ilimitadas', 'Radar multi-regiao', 'CRM, calculadora e analytics'],
  },
}

export const PLAN_ORDER: PlanKey[] = ['PRO']

export function getPlanInfo(plan?: string | null) {
  return PLAN_CATALOG.PRO
}

export function formatPlanLabel(plan?: string | null) {
  return getPlanInfo(plan).label
}
