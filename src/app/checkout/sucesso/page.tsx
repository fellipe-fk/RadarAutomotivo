import CheckoutSuccessClient from '@/components/checkout/CheckoutSuccessClient'

type CheckoutSuccessPageProps = {
  searchParams?: {
    checkoutToken?: string
  }
}

export default function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  return <CheckoutSuccessClient checkoutToken={searchParams?.checkoutToken} />
}
