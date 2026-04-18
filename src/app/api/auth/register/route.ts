import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import {
  auditLog,
  createSession,
  hashPassword,
  registerSchema,
  setAuthCookies,
} from '@/lib/auth'
import {
  createAbacateCustomer,
  getSubscriptionCheckoutByExternalId,
  isSuccessfulSubscriptionStatus,
} from '@/lib/abacatepay'
import { verifyPublicCheckoutToken } from '@/lib/checkout-token'
import { sendWelcomeEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'

function normalizeOptional(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function addMonthlyCycle(date: Date) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + 1)
  return next
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
    const checkoutToken = data.checkoutToken?.trim()
    const checkoutContext = checkoutToken ? verifyPublicCheckoutToken(checkoutToken) : null

    if (checkoutContext && checkoutContext.email !== data.email) {
      return NextResponse.json({ error: 'Use o mesmo email do checkout para criar a conta.' }, { status: 400 })
    }

    const confirmedCheckout = checkoutContext
      ? await getSubscriptionCheckoutByExternalId(checkoutContext.referenceId)
      : null

    if (checkoutContext && (!confirmedCheckout || !isSuccessfulSubscriptionStatus(confirmedCheckout.status))) {
      return NextResponse.json({ error: 'Finalize o checkout antes de criar sua conta.' }, { status: 400 })
    }

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: passwordHash,
        phone: normalizeOptional(data.phone) || checkoutContext?.phone,
        city: normalizeOptional(data.city),
        state: data.state?.trim().toUpperCase() || undefined,
        plano: checkoutContext?.plan || data.plano,
        assinaturaStatus: checkoutContext ? 'ATIVA' : 'TRIAL',
        trialEndsAt: checkoutContext ? null : trialEndsAt,
        assinaturaEndsAt: checkoutContext ? addMonthlyCycle(new Date()) : null,
        abacatepayCustomerId: checkoutContext?.customerId,
        creditosLaudo: 3,
        radarConfig: {
          create: {},
        },
      },
    })

    if (checkoutContext && confirmedCheckout) {
      await prisma.pagamento.create({
        data: {
          userId: user.id,
          valor: (confirmedCheckout.paidAmount || confirmedCheckout.amount || 0) / 100,
          descricao: `Assinatura ${checkoutContext.plan} | ref ${checkoutContext.referenceId}`,
          status: confirmedCheckout.status,
          tipo: 'ASSINATURA',
          externalReferenceId: checkoutContext.referenceId,
          billingEvent: 'public_checkout.confirmed',
          abacatepayId: confirmedCheckout.id,
        },
      })
    } else {
      try {
        const abacatepayCustomer = await createAbacateCustomer({
          name: user.name,
          email: user.email,
          cellphone: user.phone || undefined,
          zipCode: user.zipCode || undefined,
        })

        if (abacatepayCustomer?.id) {
          await prisma.user.update({
            where: { id: user.id },
            data: { abacatepayCustomerId: abacatepayCustomer.id },
          })
        }
      } catch (error) {
        console.error('Falha ao criar cliente na AbacatePay:', error)
      }
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
        assinaturaEndsAt: user.assinaturaEndsAt,
      },
    })

    setAuthCookies(response, session.accessToken, session.refreshToken)
    await auditLog(user.id, 'register', request, { plano: user.plano, paidCheckout: Boolean(checkoutContext) })

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
