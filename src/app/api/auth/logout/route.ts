import { NextRequest, NextResponse } from 'next/server'

import { auditLog, clearAuthCookies, revokeSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('ra_refresh_token')?.value
  const accessToken = request.cookies.get('ra_token')?.value

  if (refreshToken) {
    await revokeSession(refreshToken)
  }

  const response = NextResponse.json({ ok: true })
  clearAuthCookies(response)

  if (accessToken) {
    try {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1] || '', 'base64url').toString('utf-8')
      ) as { userId?: string }

      if (payload.userId) {
        await auditLog(payload.userId, 'logout', request)
      }
    } catch (error) {
      console.error('Falha ao registrar logout:', error)
    }
  }

  return response
}
