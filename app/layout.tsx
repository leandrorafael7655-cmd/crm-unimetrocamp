import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: {
    default: 'CRM Comercial · UniMetrocamp Wyden',
    template: '%s · CRM Comercial | UniMetrocamp Wyden',
  },
  description:
    'CRM Comercial da UniMetrocamp Wyden para gestão B2B, High School, metas, SuperVestibular, mapa e planejamento de rotas.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#00302b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
