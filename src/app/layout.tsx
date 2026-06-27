import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { NavSidebar } from '@/components/nav-sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = { title: 'Self-Healing Content System' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex h-screen bg-background`}>
        <NavSidebar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </body>
    </html>
  )
}
