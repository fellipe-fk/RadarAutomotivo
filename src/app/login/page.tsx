import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import LoginForm from '@/components/auth/LoginForm'
import { getUserFromAccessToken } from '@/lib/auth'

export default async function LoginPage() {
  const token = cookies().get('ra_token')?.value
  const user = token ? await getUserFromAccessToken(token) : null

  if (user) {
    redirect('/dashboard')
  }

  return <LoginForm />
}
