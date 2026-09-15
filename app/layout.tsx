import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RMA AI Recruiter',
  description: 'Adaptive Real Madrid Association player recruitment interviewer.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
