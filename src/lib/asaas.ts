type CreateAsaasCustomerInput = {
  name: string
  email: string
  phone?: string
}

type AsaasCustomerResponse = {
  id?: string
}

export async function createAsaasCustomer(
  input: CreateAsaasCustomerInput
): Promise<AsaasCustomerResponse | null> {
  const apiKey = process.env.ASAAS_API_KEY

  if (!apiKey) {
    return null
  }

  const response = await fetch('https://api-sandbox.asaas.com/v3/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      mobilePhone: input.phone,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Asaas customer error: ${response.status} ${errorText}`)
  }

  return response.json()
}
