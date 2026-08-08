import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-body' })
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' })

export const metadata: Metadata = {
  title: 'School Timetable',
  description: 'Timetable, leave, and substitutions',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${fraunces.variable} ${inter.className}`}>{children}</body>
    </html>
  )
}
