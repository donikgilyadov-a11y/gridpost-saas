'use client'

import { useEffect, useRef, useState } from 'react'
import { media, type MediaAssetView } from '@/lib/api'

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaAssetView[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      setItems(await media.list())
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => { void load() }, [])

  async function upload(file: File) {
    setBusy(true)
    setMessage('')
    try {
      const result = await media.presign({ name: file.name, mime: file.type, size: file.size })
      const response = await fetch(result.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file })
      if (!response.ok) throw new Error(`Загрузка в хранилище не удалась: HTTP ${response.status}`)
      await media.confirm(result.id)
      await load()
      setMessage(`${file.name} загружен`)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Media Library</h1>
      <div className="card">
        <div className="row">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
          <span className="dim small">До 50 МБ. Файл уходит напрямую в S3 по presigned URL.</span>
        </div>
      </div>
      {message && <div className="card small">{message}</div>}
      {busy && <div className="dim small">Загрузка…</div>}

      <div className="stats" style={{ marginTop: 16 }}>
        {items.map((item) => (
          <div className="card" key={item.id}>
            <div style={{ height: 130, background: '#0d0e10', borderRadius: 8, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
              {item.mime.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.alt ?? item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="dim">видео</span>
              )}
            </div>
            <div className="small" style={{ marginTop: 8 }}>{item.name}</div>
            <div className="row small dim" style={{ marginTop: 6 }}>
              <span className="pill">{item.mime}</span>
              <span>{Math.round(item.size / 1024)} КБ</span>
              <span className="grow" />
              <button
                className="ghost small"
                onClick={() => void media.remove(item.id).then(() => load()).catch((e: Error) => setMessage(e.message))}
              >
                удалить
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="card dim">Медиатека пуста.</div>}
      </div>
    </>
  )
}
