'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Org { id: string; name: string; slug: string; plan: string; timezone: string }

export default function SettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api<Org>('/organizations/current').then(setOrg).catch((err: Error) => setMessage(err.message))
  }, [])

  async function rotate() {
    setBusy(true)
    setMessage('')
    try {
      const result = await api<{ rotated: number }>('/organizations/current/rotate-keys', { method: 'POST' })
      setMessage(`Ключ organizations ротирован, перешифровано токенов: ${result.rotated}`)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <h2>Организация</h2>
        {org ? (
          <div className="col small">
            <div>Название: <strong>{org.name}</strong></div>
            <div>Slug: <span className="mono">{org.slug}</span></div>
            <div>Тариф: <span className="pill">{org.plan}</span></div>
            <div>Часовой пояс: <span className="mono">{org.timezone}</span></div>
          </div>
        ) : <div className="dim">Загрузка…</div>}
      </div>
      <div className="card">
        <h2>Безопасность</h2>
        <p className="dim small">Ротация создаёт новый ключ организации и перешифровывает все сохранённые токены.</p>
        <button className="primary small" onClick={() => void rotate()} disabled={busy}>
          {busy ? 'Ротация…' : 'Ротировать ключ'}
        </button>
      </div>
      {message && <div className="card small">{message}</div>}
    </>
  )
}
