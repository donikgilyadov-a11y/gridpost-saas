'use client'

import { useEffect, useMemo, useState } from 'react'
import { posts, type PostView } from '@/lib/api'

export default function CalendarPage() {
  const [items, setItems] = useState<PostView[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void posts.list().then(setItems).catch((err: Error) => setError(err.message))
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, PostView[]>()
    for (const post of items) {
      const key = post.scheduledAt
        ? new Date(post.scheduledAt).toLocaleDateString('ru-RU')
        : 'Без расписания'
      map.set(key, [...(map.get(key) ?? []), post])
    }
    return [...map.entries()]
  }, [items])

  return (
    <>
      <h1>Calendar</h1>
      <p className="dim small">Публикации сгруппированы по дате. Drag-and-drop появится в следующей итерации.</p>
      {error && <div className="error">{error}</div>}
      {groups.map(([date, list]) => (
        <div key={date}>
          <h2>{date}</h2>
          {list.map((post) => (
            <div className="card row" key={post.id}>
              <span className="mono small">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'сразу'}</span>
              <span className="grow">{Object.values(post.variants)[0]?.[0] ?? '—'}</span>
              <span className={`pill ${post.status === 'PUBLISHED' ? 'ok' : 'warn'}`}>{post.status}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
