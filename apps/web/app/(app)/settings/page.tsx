'use client'

import { useEffect, useState } from 'react'
import { ai, api, type BrandVoice } from '@/lib/api'

interface Org { id: string; name: string; slug: string; plan: string; timezone: string }

export default function SettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [voice, setVoice] = useState<BrandVoice | null>(null)

  useEffect(() => {
    void api<Org>('/organizations/current').then(setOrg).catch((err: Error) => setMessage(err.message))
    void ai.voice().then(setVoice).catch(() => undefined)
  }, [])

  async function saveVoice() {
    if (!voice) return
    setBusy(true)
    try {
      setVoice(await ai.saveVoice(voice))
      setMessage('Голос бренда сохранён')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

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
        <h2>Голос бренда</h2>
        {voice ? (
          <div className="col">
            <label className="small dim">Тон
              <input value={voice.tone} onChange={(e) => setVoice({ ...voice, tone: e.target.value })} />
            </label>
            <label className="small dim">Аудитория
              <input value={voice.audience} onChange={(e) => setVoice({ ...voice, audience: e.target.value })} />
            </label>
            <label className="small dim">Язык
              <input value={voice.language} onChange={(e) => setVoice({ ...voice, language: e.target.value })} />
            </label>
            <label className="small dim">Желаемая длина
              <input type="number" value={voice.preferredLength} onChange={(e) => setVoice({ ...voice, preferredLength: Number(e.target.value) })} />
            </label>
            <label className="small dim">Запрещённые слова (через запятую)
              <input value={voice.forbiddenWords.join(', ')} onChange={(e) => setVoice({ ...voice, forbiddenWords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </label>
            <label className="small dim">Фирменные выражения (через запятую)
              <input value={voice.phrases.join(', ')} onChange={(e) => setVoice({ ...voice, phrases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </label>
            <button className="primary small" onClick={() => void saveVoice()} disabled={busy}>Сохранить голос бренда</button>
          </div>
        ) : <div className="dim small">Загрузка…</div>}
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
