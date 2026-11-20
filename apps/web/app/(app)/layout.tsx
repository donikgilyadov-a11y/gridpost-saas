'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { clearSession, session } from '@/lib/api'
import { setLang, setTheme, t, useLang, useTheme, type LabelKey } from '@/lib/i18n'

const NAV: { href: string; label: LabelKey }[] = [
  { href: '/dashboard', label: 'dashboard' },
  { href: '/calendar', label: 'calendar' },
  { href: '/create', label: 'create' },
  { href: '/ai', label: 'aiStudio' },
  { href: '/accounts', label: 'socialAccounts' },
  { href: '/media', label: 'media' },
  { href: '/inbox', label: 'inbox' },
  { href: '/clients', label: 'clients' },
  { href: '/automations', label: 'automations' },
  { href: '/analytics', label: 'analytics' },
  { href: '/billing', label: 'billing' },
  { href: '/settings', label: 'settings' }
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const lang = useLang()
  const theme = useTheme()

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
              {t(lang, item.label)}
            </Link>
          ))}
        </nav>
        <div className="col" style={{ marginTop: 20 }}>
          <button
            className="ghost small"
            onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          >
            {lang === 'ru' ? 'EN' : 'RU'}
          </button>
          <button
            className="ghost small"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? t(lang, 'light') : t(lang, 'dark')}
          </button>
          <button
            className="ghost small"
            onClick={() => {
              clearSession()
              router.replace('/')
            }}
          >
            {t(lang, 'logout')}
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
