import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import RegisterForm from '@/components/auth/RegisterForm'
import { getUserFromAccessToken } from '@/lib/auth'

type CadastroPageProps = {
  searchParams?: {
    checkoutToken?: string
  }
}

export default async function CadastroPage({ searchParams }: CadastroPageProps) {
  const token = cookies().get('ra_token')?.value
  const user = token ? await getUserFromAccessToken(token) : null

  if (user && !searchParams?.checkoutToken) {
    redirect('/dashboard')
  }

  return <RegisterForm />
}
