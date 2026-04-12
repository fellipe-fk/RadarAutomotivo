import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { getSystemStatus } from '@/lib/system-status'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    return NextResponse.json(getSystemStatus())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nao foi possivel carregar o status do sistema.' },
      { status: 401 }
    )
  }
}
