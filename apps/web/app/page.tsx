'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, setSession, session, type AuthSession } from '@/lib/api'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session()) router.replace('/dashboard')
  }, [router])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body =
        mode === 'login'
          ? { email, password }
          : { email, password, displayName: name, organizationName: org }
      const result = await api<AuthSession & { user: { email: string } }>(
        `/auth/${mode}`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      setSession({ token: result.token, organizationId: result.organizationId, email: result.user.email })
      router.replace('/dashboard')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Gridpost <span style={{ color: 'var(--accent)' }}>SaaS</span></h1>
        <p className="dim small">Войдите или создайте организацию — данные остаются изолированными.</p>
        <label className="col small">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="col small">
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {mode === 'register' && (
          <>
            <label className="col small">Имя<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label className="col small">Организация<input value={org} onChange={(e) => setOrg(e.target.value)} required /></label>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy} type="submit">
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
        <button className="ghost" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </div>
  )
}
