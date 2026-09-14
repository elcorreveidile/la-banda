import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'La Banda',
  description: 'Diez agentes con roles fijos, veto obligatorio y traspasos trazables.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-mono text-sm">{children}</body>
    </html>
  )
}
