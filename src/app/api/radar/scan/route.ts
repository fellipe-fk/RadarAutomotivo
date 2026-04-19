import { NextRequest, NextResponse } from 'next/server'

import { auditLog, requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeRadarScan } from '@/lib/scanner/services/scan-orchestrator'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    let config = await prisma.radarConfig.findUnique({ where: { userId: user.id } })

    if (!config) {
      config = await prisma.radarConfig.create({ data: { userId: user.id } })
    }

    const result = await executeRadarScan({
      userId: user.id,
      radarConfigId: config.id,
      config,
      mode: 'manual',
      includeSearchPageFallback: true,
    })

    if (result.summary.total === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Nenhuma URL encontrada para processar.',
          hint: 'Adicione URLs manuais em seedUrls ou configure pelo menos um modelo e uma fonte validos.',
          diagnostics: {
            ...result.discovery,
            searches: result.diagnostics,
          },
          summary: result.summary,
          items: result.items,
          scanRunId: result.scanRun.id,
          scanRun: result.scanRun,
          sourceRuns: result.sourceRuns,
        },
        { status: 200 }
      )
    }

    await auditLog(user.id, 'radar.scan', request, result.summary)

    return NextResponse.json({
      ok: true,
      scanRunId: result.scanRun.id,
      scanRun: result.scanRun,
      summary: result.summary,
      items: result.items,
      diagnostics: result.diagnostics,
      sourceRuns: result.sourceRuns,
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao rodar scan real do radar:', error)
    return NextResponse.json({ error: 'Erro ao rodar scan real do radar.' }, { status: 500 })
  }
}
