import PublicCheckoutForm from '@/components/checkout/PublicCheckoutForm'

type CheckoutPageProps = {
  searchParams?: {
    plan?: string
  }
}

export default function CheckoutPage({ searchParams }: CheckoutPageProps) {
  return <PublicCheckoutForm initialPlan={searchParams?.plan} />
}
