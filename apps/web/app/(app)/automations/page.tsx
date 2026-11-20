'use client'

import { useEffect, useState } from 'react'
import { automations, type AutomationView } from '@/lib/api'

export default function AutomationsPage() {
  const [items, setItems] = useState<AutomationView[]>([])
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState('SCHEDULE_GAP')
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setItems(await automations.list())
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => { void load() }, [])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    try {
      await automations.create({
        name,
        trigger,
        action: 'CREATE_DRAFT',
        config: { topic: topic || 'новости бренда', gapDays: 3 }
      })
      setName(''); setTopic('')
      await load()
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  async function run() {
    setBusy(true)
    try {
      const result = await automations.run()
      setMessage(result.map((r) => `${r.rule}: ${r.createdDraft ?? r.reason}`).join(' · ') || 'Правил нет')
      await load()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Automations</h1>
      <form className="card col" onSubmit={create}>
        <div className="row">
          <input placeholder="Название правила" value={name} onChange={(e) => setName(e.target.value)} required />
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            <option value="SCHEDULE_GAP">Нет постов N дней</option>
            <option value="LOW_ENGAGEMENT">Низкая вовлечённость</option>
          </select>
          <input placeholder="Тема для AI" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <button className="primary small" type="submit">Создать</button>
          <button className="ghost small" type="button" onClick={() => void run()} disabled={busy}>Запустить проверку</button>
        </div>
      </form>
      {message && <div className="card small">{message}</div>}
      {items.map((item) => (
        <div className="card row" key={item.id}>
          <span className={`pill ${item.enabled ? 'ok' : ''}`}>{item.trigger}</span>
          <strong>{item.name}</strong>
          <span className="dim small grow">{item.action}</span>
          {item.lastRunAt && <span className="mono small dim">{new Date(item.lastRunAt).toLocaleString('ru-RU')}</span>}
          <button className="ghost small" onClick={() => void automations.toggle(item.id, !item.enabled).then(() => load())}>
            {item.enabled ? 'выключить' : 'включить'}
          </button>
          <button className="ghost small" onClick={() => void automations.remove(item.id).then(() => load())}>удалить</button>
        </div>
      ))}
      <p className="dim small">AI автоматизация создаёт только черновики — публикация всегда требует ручного подтверждения.</p>
    </>
  )
}
