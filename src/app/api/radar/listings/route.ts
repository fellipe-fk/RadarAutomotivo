import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function isAuthError(error: unknown) {
  return error instanceof Error && /(autenticado|token|sessao|assinatura)/i.test(error.message)
}

function parseLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.round(parsed), max)
}

function parseDays(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.round(parsed), 30)
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const limit = parseLimit(req.nextUrl.searchParams.get('limit'), 20, 100)
    const days = parseDays(req.nextUrl.searchParams.get('days'), 7)
    const listingId = req.nextUrl.searchParams.get('listingId')?.trim() || undefined
    const runId = req.nextUrl.searchParams.get('runId')?.trim() || undefined
    const source = req.nextUrl.searchParams.get('source')?.trim().toLowerCase() || undefined
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const snapshots = await prisma.listingSnapshot.findMany({
      where: {
        capturedAt: { gte: dateFrom },
        ...(listingId ? { listingId } : {}),
        ...(runId ? { scanRunId: runId } : {}),
        listing: {
          userId: user.id,
          ...(source ? { source } : {}),
        },
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            source: true,
            sourceUrl: true,
            status: true,
          },
        },
        scanRun: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            mode: true,
          },
        },
      },
      orderBy: [{ capturedAt: 'desc' }],
      take: limit,
    })

    const stats = {
      totalSnapshots: snapshots.length,
      linkedToRuns: snapshots.filter((entry) => entry.scanRunId).length,
      withOpportunityScore: snapshots.filter((entry) => entry.opportunityScore !== null).length,
      latestCapturedAt: snapshots[0]?.capturedAt || null,
    }

    return NextResponse.json({
      snapshots,
      stats,
      filters: {
        limit,
        days,
        listingId: listingId || null,
        runId: runId || null,
        source: source || null,
      },
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    console.error('Erro ao carregar snapshots do radar:', error)
    return NextResponse.json({ error: 'Erro ao carregar snapshots do scanner' }, { status: 500 })
  }
}
