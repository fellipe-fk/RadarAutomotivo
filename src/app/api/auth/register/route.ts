import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import {
  auditLog,
  createSession,
  hashPassword,
  registerSchema,
  setAuthCookies,
} from '@/lib/auth'
import { createAsaasCustomer } from '@/lib/asaas'
import { sendWelcomeEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'

function normalizeOptional(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = registerSchema.parse(body)

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
    }

    const passwordHash = await hashPassword(data.password)
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: passwordHash,
        phone: normalizeOptional(data.phone),
        city: normalizeOptional(data.city),
        state: data.state?.trim().toUpperCase() || undefined,
        plano: data.plano,
        assinaturaStatus: 'TRIAL',
        trialEndsAt,
        creditosLaudo: 3,
        radarConfig: {
          create: {},
        },
      },
    })

    try {
      const asaasCustomer = await createAsaasCustomer({
        name: user.name,
        email: user.email,
        phone: user.phone || undefined,
      })

      if (asaasCustomer?.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { asaasCustomerId: asaasCustomer.id },
        })
      }
    } catch (error) {
      console.error('Falha ao criar cliente no Asaas:', error)
    }

    try {
      await sendWelcomeEmail(user.email, user.name)
    } catch (error) {
      console.error('Falha ao enviar email de boas-vindas:', error)
    }

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
    await auditLog(user.id, 'register', request, { plano: user.plano })

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

    console.error('Erro no cadastro:', error)
    return NextResponse.json({ error: 'Erro interno no cadastro' }, { status: 500 })
  }
}
