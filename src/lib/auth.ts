import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5
const DUMMY_BCRYPT_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKxGhuJHQ7ITk5i7QkS8mVKGkvrRZtGJPD7W6'

type TokenType = 'access' | 'refresh'

type AuthTokenPayload = {
  userId: string
  type: TokenType
}

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número'),
  phone: z.string().trim().min(10).max(20).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  state: z.string().trim().length(2).optional().or(z.literal('')),
  plano: z.enum(['BASICO', 'PRO', 'AGENCIA']).optional().default('PRO'),
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

function getJwtSecret() {
  const secret = process.env.NEXTAUTH_SECRET

  if (!secret || secret.length < 32) {
    throw new Error('NEXTAUTH_SECRET inválido ou ausente')
  }

  return secret
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function safeVerifyPassword(password: string, hash?: string | null) {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH)
    return false
  }

  return verifyPassword(password, hash)
}

export function generateAccessToken(userId: string) {
  return jwt.sign({ userId, type: 'access' } satisfies AuthTokenPayload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  })
}

export function generateRefreshToken(userId: string) {
  return jwt.sign({ userId, type: 'refresh' } satisfies AuthTokenPayload, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  })
}

export function verifyToken(token: string, expectedType: TokenType) {
  const decoded = jwt.verify(token, getJwtSecret()) as AuthTokenPayload

  if (decoded.type !== expectedType) {
    throw new Error('Tipo de token inválido')
  }

  return decoded
}

export async function createSession(userId: string) {
  const accessToken = generateAccessToken(userId)
  const refreshToken = generateRefreshToken(userId)
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

  await prisma.session.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt: refreshExpiresAt,
    },
  })

  return {
    accessToken,
    refreshToken,
    refreshExpiresAt,
  }
}

export async function rotateSession(refreshToken: string) {
  const decoded = verifyToken(refreshToken, 'refresh')
  const session = await prisma.session.findUnique({
    where: { token: refreshToken },
  })

  if (!session || session.userId !== decoded.userId || session.expiresAt < new Date()) {
    throw new Error('Sessão inválida')
  }

  await prisma.session.delete({
    where: { token: refreshToken },
  })

  return createSession(decoded.userId)
}

export async function revokeSession(refreshToken: string) {
  await prisma.session.deleteMany({
    where: { token: refreshToken },
  })
}

export function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  const secure = process.env.NODE_ENV === 'production'

  response.cookies.set('ra_token', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    path: '/',
  })

  response.cookies.set('ra_refresh_token', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    path: '/',
  })
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set('ra_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  response.cookies.set('ra_refresh_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

export async function setAuthCookieFromServerAction(token: string) {
  cookies().set('ra_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    path: '/',
  })
}

export function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  return realIp || 'unknown'
}

export async function checkLoginRateLimit(ip: string, email: string) {
  const recentAttempts = await prisma.loginAttempt.count({
    where: {
      OR: [{ ip }, { email }],
      createdAt: {
        gte: new Date(Date.now() - LOGIN_WINDOW_MS),
      },
    },
  })

  return recentAttempts < LOGIN_MAX_ATTEMPTS
}

export async function recordLoginAttempt(ip: string, email: string) {
  await prisma.loginAttempt.create({
    data: { ip, email },
  })
}

export async function clearLoginAttempts(ip: string, email: string) {
  await prisma.loginAttempt.deleteMany({
    where: {
      OR: [{ ip }, { email }],
    },
  })
}

export async function getUserFromAccessToken(token: string) {
  try {
    const decoded = verifyToken(token, 'access')

    return await prisma.user.findUnique({
      where: { id: decoded.userId },
    })
  } catch {
    return null
  }
}

export async function requireAuth(request: NextRequest) {
  const bearerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const cookieToken = request.cookies.get('ra_token')?.value
  const token = bearerToken || cookieToken

  if (!token) {
    throw new Error('Não autenticado')
  }

  const user = await getUserFromAccessToken(token)

  if (!user) {
    throw new Error('Token inválido')
  }

  if (user.assinaturaStatus === 'SUSPENSA') {
    throw new Error('Assinatura suspensa')
  }

  return user
}

export async function auditLog(userId: string, action: string, request: NextRequest, details?: object) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      details: details ? JSON.stringify(details) : null,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
    },
  })
}
