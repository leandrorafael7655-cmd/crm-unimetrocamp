import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: {
    default: 'UniConecta · UniMetrocamp | Wyden',
    template: '%s · UniConecta | UniMetrocamp Wyden',
  },
  description:
    'UniConecta é a plataforma de gestão comercial integrada da UniMetrocamp | Wyden para B2B, High School, metas, SuperVestibular, mapas e rotas.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#88005b',
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
