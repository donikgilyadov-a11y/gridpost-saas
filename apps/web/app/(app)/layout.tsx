'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { clearSession, session } from '@/lib/api'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/create', label: 'Create' },
  { href: '/ai', label: 'AI Studio' },
  { href: '/accounts', label: 'Social Accounts' },
  { href: '/settings', label: 'Settings' }
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!session()) router.replace('/')
  }, [router])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">GRID<span>POST</span></div>
        <nav className="nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          className="ghost small"
          style={{ marginTop: 24, width: '100%' }}
          onClick={() => {
            clearSession()
            router.replace('/')
          }}
        >
          Выйти
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
