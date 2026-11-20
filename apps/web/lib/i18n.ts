'use client'

import { useEffect, useState } from 'react'

export type Lang = 'ru' | 'en'

export const LABELS = {
  dashboard: { ru: 'Главная', en: 'Dashboard' },
  calendar: { ru: 'Календарь', en: 'Calendar' },
  create: { ru: 'Создать', en: 'Create' },
  aiStudio: { ru: 'AI Studio', en: 'AI Studio' },
  socialAccounts: { ru: 'Аккаунты', en: 'Social Accounts' },
  media: { ru: 'Медиа', en: 'Media' },
  inbox: { ru: 'Входящие', en: 'Inbox' },
  clients: { ru: 'Клиенты', en: 'Clients' },
  automations: { ru: 'Автоматизации', en: 'Automations' },
  analytics: { ru: 'Аналитика', en: 'Analytics' },
  billing: { ru: 'Оплата', en: 'Billing' },
  settings: { ru: 'Настройки', en: 'Settings' },
  logout: { ru: 'Выйти', en: 'Log out' },
  light: { ru: 'Светлая тема', en: 'Light theme' },
  dark: { ru: 'Тёмная тема', en: 'Dark theme' }
} as const

export type LabelKey = keyof typeof LABELS

const KEY_LANG = 'gridpost.lang'
const KEY_THEME = 'gridpost.theme'

export function currentLang(): Lang {
  if (typeof window === 'undefined') return 'ru'
  return window.localStorage.getItem(KEY_LANG) === 'en' ? 'en' : 'ru'
}

export function currentTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem(KEY_THEME) === 'light' ? 'light' : 'dark'
}

export function setLang(lang: Lang): void {
  window.localStorage.setItem(KEY_LANG, lang)
  window.dispatchEvent(new Event('gridpost-locale'))
}

export function setTheme(theme: 'dark' | 'light'): void {
  window.localStorage.setItem(KEY_THEME, theme)
  document.documentElement.dataset.theme = theme
}

export function t(lang: Lang, key: LabelKey): string {
  return LABELS[key][lang]
}

export function useLang(): Lang {
  const [lang, setLangState] = useState<Lang>('ru')
  useEffect(() => {
    const sync = () => setLangState(currentLang())
    sync()
    window.addEventListener('gridpost-locale', sync)
    return () => window.removeEventListener('gridpost-locale', sync)
  }, [])
  return lang
}

export function useTheme(): 'dark' | 'light' {
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')
  useEffect(() => {
    const sync = () => {
      const value = currentTheme()
      setThemeState(value)
      document.documentElement.dataset.theme = value
    }
    sync()
    window.addEventListener('gridpost-locale', sync)
    return () => window.removeEventListener('gridpost-locale', sync)
  }, [])
  return theme
}
