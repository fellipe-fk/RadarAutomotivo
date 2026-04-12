function hasValue(value?: string) {
  return typeof value === 'string' && value.trim().length > 0
}

export function getSystemOpenAiApiKey() {
  return process.env.RADARAUTO_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || ''
}

export function getSystemStatus() {
  const openAiConfigured = hasValue(getSystemOpenAiApiKey())

  return {
    aiProvider: 'OpenAI',
    aiConfigured: openAiConfigured,
    openAiConfigured,
    telegramConfigured: hasValue(process.env.TELEGRAM_BOT_TOKEN),
    whatsappConfigured: hasValue(process.env.WHATSAPP_TOKEN) && hasValue(process.env.WHATSAPP_PHONE_ID),
    fipeConfigured: hasValue(process.env.FIPE_API_URL),
    asaasConfigured: hasValue(process.env.ASAAS_API_KEY),
    emailConfigured: false,
    mapsConfigured: false,
    publicAppConfigured: hasValue(process.env.NEXT_PUBLIC_APP_URL),
  }
}
