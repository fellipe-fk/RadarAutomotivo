import { NextRequest, NextResponse } from 'next/server'

const protectedPrefixes = [
  '/dashboard',
  '/oportunidades',
  '/analisar',
  '/crm',
  '/calculadora',
  '/radar',
  '/analytics',
  '/alertas',
  '/laudo',
  '/integracoes',
  '/assinatura',
  '/perfil',
]

function matchesProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get('ra_token')?.value

  if (matchesProtectedPath(pathname) && !token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/oportunidades/:path*', '/analisar/:path*', '/crm/:path*', '/calculadora/:path*', '/radar/:path*', '/analytics/:path*', '/alertas/:path*', '/laudo/:path*', '/integracoes/:path*', '/assinatura/:path*', '/perfil/:path*', '/login', '/cadastro'],
}
