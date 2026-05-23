import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SIR V2 — Life Operating System',
  description: 'Private cognitive-relational OS. Mission Control of life.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className={inter.className + ' bg-[#0a0a0a] text-[#f5f5f5] antialiased'}>
        {children}
      </body>
    </html>
  )
}
