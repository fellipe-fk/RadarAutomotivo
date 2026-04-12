import { Telegraf } from 'telegraf'

let bot: Telegraf | null = null

function getBot(): Telegraf {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN não configurado no .env')
  }
  if (!bot) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)
  }
  return bot
}

export async function sendTelegramAlert(message: string, chatId?: string): Promise<boolean> {
  try {
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID
    if (!targetChatId) {
      console.warn('Telegram: TELEGRAM_CHAT_ID não configurado')
      return false
    }
    const telegram = getBot()
    await telegram.telegram.sendMessage(targetChatId, message, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    })
    return true
  } catch (error) {
    console.error('Erro ao enviar alerta Telegram:', error)
    return false
  }
}

export async function testTelegramConnection(chatId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await sendTelegramAlert('✅ *Radar AutoMoto IA conectado!*\nAlertas de oportunidades serão enviados aqui.', chatId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}
