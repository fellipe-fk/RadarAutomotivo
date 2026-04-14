import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeRadarConfig } from '@/lib/radar'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function getIntervalMinutes(frequenciaMin?: number) {
  const value = Number(frequenciaMin || 0)
  if (value >= 240) return 240
  if (value >= 120) return 120
  if (value >= 60) return 60
  return 30
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const sessionToken = request.headers.get('x-auto-scan-token')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && sessionToken !== cronSecret) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const configRecord = await prisma.radarConfig.findUnique({ where: { userId: user.id } })
    const normalized = normalizeRadarConfig(configRecord)
    const now = new Date()

    if (!normalized.ativo) {
      return NextResponse.json({ skipped: true, reason: 'Radar pausado' })
    }

    const lastScanAt = configRecord?.updatedAt || null
    const intervalMinutes = getIntervalMinutes(normalized.frequenciaMin)

    if (lastScanAt) {
      const elapsedMinutes = Math.floor((now.getTime() - new Date(lastScanAt).getTime()) / 60000)
      if (elapsedMinutes < intervalMinutes) {
        return NextResponse.json({
          skipped: true,
          reason: 'Ainda nao venceu a frequencia configurada',
          nextScanInMinutes: intervalMinutes - elapsedMinutes,
        })
      }
    }

    const scanResponse = await fetch(new URL('/api/radar/scan', request.url), {
      method: 'POST',
      headers: {
        Cookie: request.headers.get('cookie') || '',
        Authorization: request.headers.get('authorization') || '',
        'x-auto-scan-token': cronSecret || '',
      },
    })

    const scanData = await scanResponse.json()

    if (!scanResponse.ok) {
      return NextResponse.json(
        {
          error: scanData.error || 'Falha ao executar auto-scan',
          summary: scanData.summary || null,
        },
        { status: scanResponse.status }
      )
    }

    return NextResponse.json({
      ok: true,
      summary: scanData.summary,
      items: scanData.items,
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao executar auto-scan:', error)
    return NextResponse.json({ error: 'Erro ao executar auto-scan' }, { status: 500 })
  }
}
