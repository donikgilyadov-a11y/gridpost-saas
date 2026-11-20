'use client'

import { useEffect, useState } from 'react'
import { accounts, type SocialAccountView } from '@/lib/api'

export default function AccountsPage() {
  const [list, setList] = useState<SocialAccountView[]>([])
  const [error, setError] = useState('')
  const [platform, setPlatform] = useState('telegram')
  const [externalId, setExternalId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')

  async function refresh() {
    try {
      setList(await accounts.list())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function oauth(name: string) {
    try {
      const url = await accounts.oauthUrl(name)
      window.location.href = url
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await accounts.connect({
        platform,
        externalId,
        displayName,
        token,
        metadata: platform === 'telegram' ? { chatId } : {}
      })
      setExternalId(''); setDisplayName(''); setToken(''); setChatId('')
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <>
      <h1>Social Accounts</h1>
      <div className="card">
        <h2>Официальный OAuth</h2>
        <p className="dim small">Рекомендуемый способ: токен хранится зашифрованным, scopes и срок действия отслеживаются сервером.</p>
        <div className="row">
          <button className="primary small" onClick={() => void oauth('facebook')}>Подключить Facebook Pages</button>
          <button className="primary small" onClick={() => void oauth('instagram')}>Подключить Instagram Business</button>
          <button className="ghost small" onClick={() => void oauth('linkedin')}>LinkedIn</button>
          <button className="ghost small" onClick={() => void oauth('x')}>X (Twitter)</button>
        </div>
      </div>

      <div className="card">
        <h2>Ручное подключение (Telegram Bot API)</h2>
        <form className="col" onSubmit={connect}>
          <input placeholder="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} />
          <input placeholder="Bot ID / external ID" value={externalId} onChange={(e) => setExternalId(e.target.value)} required />
          <input placeholder="Отображаемое имя" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <input placeholder="Bot token" value={token} onChange={(e) => setToken(e.target.value)} required />
          <input placeholder="Chat ID (@channel или -100…)" value={chatId} onChange={(e) => setChatId(e.target.value)} required />
          <button className="primary" type="submit">Сохранить</button>
        </form>
      </div>

      {error && <div className="error">{error}</div>}
      <h2>Подключённые аккаунты</h2>
      {!list.length && <div className="card dim">Пока нет аккаунтов.</div>}
      {list.map((item) => (
        <div className="card row" key={item.id}>
          <span className="pill">{item.platform}</span>
          <span className="grow">{item.displayName}</span>
          <span className="mono small dim">{item.externalId}</span>
          <span className={`pill ${item.status === 'ACTIVE' ? 'ok' : 'err'}`}>{item.status}</span>
        </div>
      ))}
    </>
  )
}
