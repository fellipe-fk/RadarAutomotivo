import { prisma } from '@/lib/prisma'

export const ALERT_COOLDOWN_MINUTES = 180
export const USER_ALERT_BURST_LIMIT = 5
export const USER_ALERT_BURST_WINDOW_MINUTES = 15
export const SUPPRESSED_ALERT_ERROR_PREFIX = 'Suprimido:'

export interface AlertThrottleDecision {
  allowed: boolean
  reason?: string
}

export async function canDispatchListingAlert(userId: string, listingId: string): Promise<AlertThrottleDecision> {
  const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60_000)
  const burstSince = new Date(Date.now() - USER_ALERT_BURST_WINDOW_MINUTES * 60_000)

  const [recentListingAlert, recentUserAlerts] = await Promise.all([
    prisma.alert.findFirst({
      where: {
        userId,
        listingId,
        sent: true,
        createdAt: {
          gte: cooldownSince,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        createdAt: true,
      },
    }),
    prisma.alert.count({
      where: {
        userId,
        sent: true,
        createdAt: {
          gte: burstSince,
        },
      },
    }),
  ])

  if (recentListingAlert) {
    return {
      allowed: false,
      reason: 'Alerta recente para este anuncio ainda esta em cooldown.',
    }
  }

  if (recentUserAlerts >= USER_ALERT_BURST_LIMIT) {
    return {
      allowed: false,
      reason: 'Volume recente de alertas acima do limite de burst.',
    }
  }

  return { allowed: true }
}
