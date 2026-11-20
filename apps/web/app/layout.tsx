import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gridpost SaaS',
  description: 'Multi-tenant social publishing'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
