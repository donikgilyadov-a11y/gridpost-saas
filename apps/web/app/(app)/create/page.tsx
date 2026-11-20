'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { accounts, posts, type SocialAccountView } from '@/lib/api'

export default function CreatePost() {
  const router = useRouter()
  const [list, setList] = useState<SocialAccountView[]>([])
  const [langs, setLangs] = useState<string[]>(['RU', 'EN'])
  const [texts, setTexts] = useState<Record<string, string>>({ RU: '', EN: '' })
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [langFor, setLangFor] = useState<Record<string, string>>({})
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void accounts.list().then((items) => {
      setList(items)
      const langMap: Record<string, string> = {}
      for (const item of items) langMap[item.id] = 'RU'
      setLangFor(langMap)
    }).catch((err: Error) => setError(err.message))
  }, [])

  function toggleLang(lang: string) {
    setLangs((prev) => (prev.includes(lang) ? prev.filter((x) => x !== lang) : [...prev, lang]))
    setTexts((prev) => ({ ...prev, [lang]: prev[lang] ?? '' }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const variants: Record<string, string[]> = {}
    for (const lang of langs) {
      const lines = texts[lang]?.split('\n').map((line) => line.trim()).filter(Boolean) ?? []
      if (lines.length) variants[lang] = lines
    }
    const targets = list
      .filter((item) => selected[item.id])
      .map((item) => ({ accountId: item.id, lang: langFor[item.id] ?? 'RU' }))
    if (!Object.keys(variants).length) return setError('Добавьте хотя бы один текст')
    if (!targets.length) return setError('Выберите хотя бы один аккаунт')

    setBusy(true)
    try {
      await posts.create({
        key: crypto.randomUUID(),
        variants,
        targets,
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {})
      })
      router.replace('/dashboard')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Создать публикацию</h1>
      <form onSubmit={submit}>
        <div className="card">
          <h2>Языковые варианты</h2>
          <div className="row">
            {['RU', 'EN', 'ES', 'DE', 'FR'].map((lang) => (
              <button type="button" key={lang} className={langs.includes(lang) ? 'primary small' : 'ghost small'} onClick={() => toggleLang(lang)}>
                {lang}
              </button>
            ))}
          </div>
          {langs.map((lang) => (
            <div key={lang} style={{ marginTop: 14 }}>
              <div className="small dim" style={{ marginBottom: 4 }}>{lang} — каждая строка отдельный пост в ветке</div>
              <textarea value={texts[lang] ?? ''} onChange={(e) => setTexts({ ...texts, [lang]: e.target.value })} />
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Получатели</h2>
          {!list.length && <div className="dim small">Нет подключённых аккаунтов. <a href="/accounts" style={{ color: 'var(--accent)' }}>Подключить →</a></div>}
          {list.map((item) => (
            <div className="row" key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <input type="checkbox" checked={Boolean(selected[item.id])} onChange={(e) => setSelected({ ...selected, [item.id]: e.target.checked })} />
              <span className="pill">{item.platform}</span>
              <span className="grow">{item.displayName}</span>
              <select value={langFor[item.id] ?? 'RU'} onChange={(e) => setLangFor({ ...langFor, [item.id]: e.target.value })}>
                {langs.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Время</h2>
          <div className="row">
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            {scheduledAt && <button type="button" className="ghost small" onClick={() => setScheduledAt('')}>Сейчас</button>}
          </div>
          <p className="dim small">Пустое поле — публикация сразу. Время передаётся как UTC-момент.</p>
        </div>

        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Отправляем…' : scheduledAt ? 'Запланировать' : 'Опубликовать'}
        </button>
      </form>
    </>
  )
}
