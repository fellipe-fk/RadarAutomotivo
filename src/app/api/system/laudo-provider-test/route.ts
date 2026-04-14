import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { consultarLaudoVeicular, getLaudoProviderStatus, normalizarPlaca, type LaudoProviderOverride } from '@/lib/laudo'

export const dynamic = 'force-dynamic'

function normalizeProvider(value: string | null): LaudoProviderOverride | null {
  if (!value) return 'placasapp'

  const normalized = value.trim().toLowerCase()

  if (normalized === 'placasapp' || normalized === 'placas.app') {
    return 'placasapp'
  }

  if (normalized === 'consultarplaca') {
    return 'consultarplaca'
  }

  return null
}

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function canBypassAuthForLocalDev(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  const hostname = request.nextUrl.hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export async function GET(request: NextRequest) {
  try {
    const bypassedAuth = canBypassAuthForLocalDev(request)

    if (!bypassedAuth) {
      await requireAuth(request)
    }

    const provider = normalizeProvider(request.nextUrl.searchParams.get('provider'))

    if (!provider) {
      return NextResponse.json({ error: 'Provider invalido. Use consultarplaca ou placasapp.' }, { status: 400 })
    }

    const plate = normalizarPlaca(request.nextUrl.searchParams.get('plate') || 'AAA0005')
    const renavam = request.nextUrl.searchParams.get('renavam')?.trim() || undefined

    if (plate.length !== 7) {
      return NextResponse.json({ error: 'Placa invalida para teste.' }, { status: 400 })
    }

    const providerStatus = getLaudoProviderStatus(provider)

    if (!providerStatus.configured) {
      return NextResponse.json(
        {
          error: `${providerStatus.providerName} nao esta configurado para teste.`,
          provider: providerStatus,
        },
        { status: 400 }
      )
    }

    const result = await consultarLaudoVeicular(plate, renavam, { providerOverride: provider })

    return NextResponse.json({
      ok: true,
      testMode: true,
      authMode: bypassedAuth ? 'local-dev-bypass' : 'session',
      provider: providerStatus,
      plate,
      result,
      summary: {
        origem: result.origem,
        situacao: result.situacao_geral,
        score: result.score_compra,
        veiculo: `${result.veiculo.marca} ${result.veiculo.modelo} ${result.veiculo.ano_mod}`,
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao testar provider de laudo:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao testar provider de laudo' },
      { status: 500 }
    )
  }
}
