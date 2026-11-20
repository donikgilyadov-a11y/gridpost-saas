'use client'

import { useEffect, useMemo, useState } from 'react'
import { posts, type PostView } from '@/lib/api'

interface Group {
  key: string
  label: string
  items: PostView[]
}

function dateKey(value: string | null): string {
  if (!value) return 'unscheduled'
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function labelFor(key: string): string {
  if (key === 'unscheduled') return 'Без расписания'
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'long' })
}

export default function CalendarPage() {
  const [items, setItems] = useState<PostView[]>([])
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)

  async function load() {
    try {
      setItems(await posts.list())
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => { void load() }, [])

  const groups = useMemo(() => {
    const map = new Map<string, PostView[]>()
    for (const post of items) {
      const key = dateKey(post.scheduledAt)
      map.set(key, [...(map.get(key) ?? []), post])
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b)))
      .map(([key, list]): Group => ({ key, label: labelFor(key), items: list }))
  }, [items])

  async function dropOn(key: string) {
    if (!dragging) return
    const date = key === 'unscheduled' ? new Date(Date.now() + 3_600_000) : new Date(`${key}T09:00:00`)
    try {
      await posts.reschedule(dragging, date.toISOString())
      setMessage(`Пост перенесён на ${date.toLocaleString('ru-RU')}`)
      await load()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setDragging(null)
    }
  }

  return (
    <>
      <h1>Calendar</h1>
      <p className="dim small">Перетащите пост на другую дату — время по умолчанию 09:00. Опубликованные посты не переносятся.</p>
      {message && <div className="card small" style={{ marginTop: 10 }}>{message}</div>}
      {groups.map((group) => (
        <div
          key={group.key}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => void dropOn(group.key)}
          style={{ minHeight: 70, borderRadius: 12, outline: dragging ? '1px dashed var(--accent)' : undefined, padding: 6, marginBottom: 12 }}
        >
          <h2 style={{ margin: '4px 6px 10px' }}>{group.label}</h2>
          {group.items.map((post) => (
            <div
              className="card row"
              key={post.id}
              draggable={post.status !== 'PUBLISHED' && post.status !== 'PUBLISHING'}
              onDragStart={() => setDragging(post.id)}
              onDragEnd={() => setDragging(null)}
              style={{ cursor: 'grab' }}
            >
              <span className="mono small">
                {post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'сразу'}
              </span>
              <span className="grow">{Object.values(post.variants)[0]?.[0] ?? '—'}</span>
              <span className={`pill ${post.status === 'PUBLISHED' ? 'ok' : 'warn'}`}>{post.status}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
