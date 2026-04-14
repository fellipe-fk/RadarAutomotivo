// ─────────────────────────────────────────────────────────────
// /api/radar/auto-scan
// Chamado pelo Vercel Cron a cada 30 minutos.
// Executa o scan para cada usuário com radar ativo cuja
// frequência configurada esteja vencida.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60 // segundos

export async function GET(req: NextRequest) {
  // Segurança: só o Vercel Cron pode chamar esta rota
  const authHeader = req.headers.get('authorization')
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    // Buscar usuários com radar ativo e assinatura válida
    const users = await prisma.user.findMany({
      where: {
        assinaturaStatus: { in: ['ATIVA', 'TRIAL'] },
        radarConfig: { ativo: true },
      },
      include: { radarConfig: true },
    })

    const results: Array<{
      userId: string
      status: 'scanned' | 'skipped' | 'error'
      reason?: string
      summary?: Record<string, unknown>
    }> = []

    for (const user of users) {
      const config = user.radarConfig
      if (!config) {
        results.push({ userId: user.id, status: 'skipped', reason: 'Sem configuração de radar' })
        continue
      }

      // Calcular quando foi o último scan
      const lastListing = await prisma.listing.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })

      const lastScanAt = lastListing?.createdAt
      const frequenciaMs = (config.frequenciaMin || 60) * 60 * 1000
      const deveRodar = !lastScanAt || (now.getTime() - lastScanAt.getTime()) >= frequenciaMs

      if (!deveRodar) {
        const minutosRestantes = Math.round(
          (frequenciaMs - (now.getTime() - lastScanAt!.getTime())) / 60000
        )
        results.push({
          userId: user.id,
          status: 'skipped',
          reason: `Próximo scan em ${minutosRestantes} min`,
        })
        continue
      }

      // Disparar o scan para este usuário usando a API interna
      // O scan usa o cookie da sessão — aqui geramos um token temporário de sistema
      try {
        // Gerar token de sessão temporário para este usuário
        const session = await prisma.session.create({
          data: {
            userId: user.id,
            token: `cron_${user.id}_${Date.now()}`,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
          },
        })

        const scanRes = await fetch(`${appUrl}/api/radar/scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `ra_token=${session.token}`,
          },
          signal: AbortSignal.timeout(50000),
        })

        // Limpar token temporário
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {})

        if (scanRes.ok) {
          const data = await scanRes.json() as { summary?: Record<string, unknown> }
          results.push({ userId: user.id, status: 'scanned', summary: data.summary })
        } else {
          const err = await scanRes.json() as { error?: string }
          results.push({ userId: user.id, status: 'error', reason: err.error || `HTTP ${scanRes.status}` })
        }
      } catch (err) {
        results.push({
          userId: user.id,
          status: 'error',
          reason: err instanceof Error ? err.message : 'Timeout ou erro interno',
        })
      }
    }

    const scanned = results.filter(r => r.status === 'scanned').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const errors = results.filter(r => r.status === 'error').length

    console.log(`[auto-scan] ${now.toISOString()} — scanned: ${scanned}, skipped: ${skipped}, errors: ${errors}`)

    return NextResponse.json({
      timestamp: now.toISOString(),
      total: users.length,
      scanned,
      skipped,
      errors,
      results,
    })
  } catch (error) {
    console.error('[auto-scan] Erro geral:', error)
    return NextResponse.json({ error: 'Erro interno no auto-scan' }, { status: 500 })
  }
}
