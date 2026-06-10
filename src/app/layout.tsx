import type { Metadata } from 'next'
import Script from 'next/script'
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
  // Analytics opcionales (ADR 0008): solo se activan si su ID está en el env.
  // IDs públicos por naturaleza (GA4 measurement id / Clarity project id).
  const gaId = process.env.NEXT_PUBLIC_GA4_ID
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID
  return (
    <html lang="es" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans bg-background text-foreground antialiased">
        {children}
        <DataMigrationGate />
        <Toaster />
        <Analytics />
        {gaId ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        ) : null}
        {clarityId ? (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityId}")`}
          </Script>
        ) : null}
      </body>
    </html>
  )
}
