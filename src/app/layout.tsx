import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kicau Mania 🐱',
  description: 'Tutup hidungmu buat kucing nyanyi! by Scuba Kicau Mania',
  openGraph: {
    title: 'Kicau Mania 🐱',
    description: 'Tutup hidungmu buat kucing nyanyi!',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
