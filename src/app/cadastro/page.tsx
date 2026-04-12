import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import RegisterForm from '@/components/auth/RegisterForm'
import { getUserFromAccessToken } from '@/lib/auth'

export default async function CadastroPage() {
  const token = cookies().get('ra_token')?.value
  const user = token ? await getUserFromAccessToken(token) : null

  if (user) {
    redirect('/dashboard')
  }

  return <RegisterForm />
}
