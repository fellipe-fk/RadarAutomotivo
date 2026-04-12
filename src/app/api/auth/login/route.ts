import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import {
  auditLog,
  checkLoginRateLimit,
  clearLoginAttempts,
  createSession,
  getClientIp,
  loginSchema,
  recordLoginAttempt,
  safeVerifyPassword,
  setAuthCookies,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = loginSchema.parse(body)
    const ip = getClientIp(request)

    const allowed = await checkLoginRateLimit(ip, data.email)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
        { status: 429 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    })

    const passwordValid = await safeVerifyPassword(data.password, user?.password)

    if (!user || !passwordValid) {
      await recordLoginAttempt(ip, data.email)

      return NextResponse.json({ error: 'Email ou senha inválidos' }, { status: 401 })
    }

    if (user.assinaturaStatus === 'SUSPENSA') {
      return NextResponse.json({ error: 'Conta suspensa' }, { status: 403 })
    }

    await clearLoginAttempts(ip, data.email)

    const session = await createSession(user.id)
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plano: user.plano,
        assinaturaStatus: user.assinaturaStatus,
        trialEndsAt: user.trialEndsAt,
      },
    })

    setAuthCookies(response, session.accessToken, session.refreshToken)
    await auditLog(user.id, 'login', request)

    return response
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Dados inválidos',
          details: error.flatten(),
        },
        { status: 400 }
      )
    }

    console.error('Erro no login:', error)
    return NextResponse.json({ error: 'Erro interno no login' }, { status: 500 })
  }
}
