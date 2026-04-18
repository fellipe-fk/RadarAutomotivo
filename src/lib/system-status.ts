import { getLaudoProviderStatus } from '@/lib/laudo'
import { isAbacatePayConfigured } from '@/lib/abacatepay'

function hasValue(value?: string) {
  return typeof value === 'string' && value.trim().length > 0
}

export function getSystemOpenAiApiKey() {
  return process.env.RADARAUTO_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || ''
}

export function getSystemStatus() {
  const openAiConfigured = hasValue(getSystemOpenAiApiKey())
  const laudoStatus = getLaudoProviderStatus()
  const publicAppConfigured = hasValue(process.env.NEXT_PUBLIC_APP_URL)
  const abacatepayWebhookConfigured = hasValue(process.env.ABACATEPAY_WEBHOOK_SECRET)
  const abacatepayConfigured = isAbacatePayConfigured()

  return {
    aiProvider: 'OpenAI',
    aiConfigured: openAiConfigured,
    openAiConfigured,
    telegramConfigured: hasValue(process.env.TELEGRAM_BOT_TOKEN),
    whatsappConfigured: hasValue(process.env.WHATSAPP_TOKEN) && hasValue(process.env.WHATSAPP_PHONE_ID),
    fipeConfigured: hasValue(process.env.FIPE_API_URL),
    abacatepayConfigured,
    abacatepayWebhookConfigured,
    abacatepayReady: abacatepayConfigured && abacatepayWebhookConfigured && publicAppConfigured,
    asaasConfigured: false,
    emailConfigured: false,
    mapsConfigured: false,
    laudoConfigured: laudoStatus.configured,
    laudoProviderName: laudoStatus.configured ? laudoStatus.providerName : 'Triagem automatica interna',
    publicAppConfigured,
  }
}
