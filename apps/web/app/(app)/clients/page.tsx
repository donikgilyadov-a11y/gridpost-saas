'use client'

import { useEffect, useState } from 'react'
import { clients, type ClientView } from '@/lib/api'

export default function ClientsPage() {
  const [items, setItems] = useState<ClientView[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    try {
      setItems(await clients.list())
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => { void load() }, [])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    try {
      await clients.create({ name, description })
      setName(''); setDescription('')
      await load()
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <>
      <h1>Clients</h1>
      <form className="card row" onSubmit={create}>
        <input placeholder="Название клиента" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Описание" value={description} onChange={(e) => setDescription(e.target.value)} />
        <button className="primary small" type="submit">Добавить</button>
      </form>
      {message && <div className="card small">{message}</div>}
      {!items.length && <div className="card dim">Клиентов пока нет.</div>}
      {items.map((item) => (
        <div className="card row" key={item.id}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color }} />
          <strong>{item.name}</strong>
          <span className="dim small grow">{item.description}</span>
          <span className="pill">{item._count.socialAccounts} аккаунтов</span>
          <button className="ghost small" onClick={() => void clients.remove(item.id).then(() => load())}>удалить</button>
        </div>
      ))}
    </>
  )
}
