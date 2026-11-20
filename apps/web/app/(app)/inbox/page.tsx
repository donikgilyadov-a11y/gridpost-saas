'use client'

import { useEffect, useState } from 'react'
import { inbox, type InboxItem } from '@/lib/api'

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setItems(await inbox.list())
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => { void load() }, [])

  async function sync() {
    setBusy(true)
    try {
      const result = await inbox.sync()
      setMessage(`Импортировано комментариев: ${result.imported}${result.errors.length ? `, ошибок: ${result.errors.length}` : ''}`)
      await load()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Inbox</h1>
      <button className="primary small" onClick={() => void sync()} disabled={busy}>Синхронизировать комментарии</button>
      {message && <div className="card small" style={{ marginTop: 12 }}>{message}</div>}
      {!items.length && <div className="card dim" style={{ marginTop: 16 }}>Сообщений пока нет. Подключите Facebook/Instagram и синхронизируйте.</div>}
      {items.map((item) => (
        <div className="card" key={item.id} style={{ opacity: item.isRead ? 0.65 : 1 }}>
          <div className="row">
            <span className="pill">{item.platform}</span>
            <strong className="small">{item.author}</strong>
            <span className="mono small dim">{new Date(item.createdAt).toLocaleString('ru-RU')}</span>
            <span className="grow" />
            {!item.isRead && (
              <button className="ghost small" onClick={() => void inbox.read(item.id).then(() => load())}>прочитано</button>
            )}
          </div>
          <p className="small" style={{ marginBottom: 0 }}>{item.text}</p>
        </div>
      ))}
    </>
  )
}
