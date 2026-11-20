'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, posts, type PostView } from '@/lib/api'

export default function Dashboard() {
  const [items, setItems] = useState<PostView[]>([])
  const [error, setError] = useState('')
  const [org, setOrg] = useState('—')

  useEffect(() => {
    void posts
      .list()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
    void api<{ name: string }>('/organizations/current')
      .then((data) => setOrg(data.name))
      .catch(() => undefined)
  }, [])

  const published = items.filter((p) => p.status === 'PUBLISHED').length
  const failed = items.filter((p) => p.status === 'FAILED').length
  const scheduled = items.filter((p) => p.status === 'SCHEDULED').length

  return (
    <>
      <h1>Dashboard</h1>
      <p className="dim">Организация: <span className="mono">{org}</span></p>
      <div className="stats">
        <div className="card"><div className="dim small">Всего постов</div><div className="stat">{items.length}</div></div>
        <div className="card"><div className="dim small">Опубликовано</div><div className="stat" style={{ color: 'var(--ok)' }}>{published}</div></div>
        <div className="card"><div className="dim small">Запланировано</div><div className="stat" style={{ color: 'var(--warn)' }}>{scheduled}</div></div>
        <div className="card"><div className="dim small">Ошибок</div><div className="stat" style={{ color: 'var(--err)' }}>{failed}</div></div>
      </div>

      <div className="row" style={{ margin: '18px 0' }}>
        <Link className="card grow" href="/create">＋ Создать публикацию</Link>
        <Link className="card grow" href="/accounts">Подключить аккаунт</Link>
      </div>

      {error && <div className="error">{error}</div>}
      <h2>Последние публикации</h2>
      {!items.length && <div className="card dim">Пока нет постов. Создайте первый.</div>}
      {items.map((post) => (
        <div className="card" key={post.id}>
          <div className="row">
            <span className="mono small">{new Date(post.createdAt).toLocaleString('ru-RU')}</span>
            <span className={`pill ${post.status === 'PUBLISHED' ? 'ok' : post.status === 'FAILED' ? 'err' : 'warn'}`}>{post.status}</span>
            <span className="spacer grow" />
            {post.status === 'DRAFT' && (
              <button className="primary small" onClick={() => void posts.publish(post.id).then(() => location.reload())}>
                Опубликовать
              </button>
            )}
            {post.status === 'FAILED' && (
              <button className="ghost small" onClick={() => void posts.retry(post.id).then(() => location.reload())}>
                ретрай
              </button>
            )}
          </div>
          <p>{Object.values(post.variants)[0]?.[0] ?? '—'}</p>
          <div className="row small dim">
            {post.targets.map((target) => (
              <span className="pill" key={target.id}>
                {target.lang} · {target.status}
                {target.error ? ` · ${target.error.slice(0, 40)}` : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
