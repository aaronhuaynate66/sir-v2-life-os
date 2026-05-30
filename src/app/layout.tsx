import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { DataMigrationGate } from '@/components/system/DataMigrationGate'
import './globals.css'

export const metadata: Metadata = {
  title: 'SIR V2 — Life Operating System',
  description: 'Private cognitive-relational OS. Mission Control of life.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans bg-[#0a0a0a] text-[#f5f5f5] antialiased">
        {children}
        <DataMigrationGate />
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
