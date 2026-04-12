export async function sendWelcomeEmail(email: string, name: string) {
  console.log(`Boas-vindas para ${name} <${email}>`)
  return { sent: false, reason: 'Email provider não configurado' }
}
