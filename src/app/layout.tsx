import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Radar AutoMoto IA - Radar de Oportunidades',
  description: 'Encontre motos e carros abaixo do mercado para revenda',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
