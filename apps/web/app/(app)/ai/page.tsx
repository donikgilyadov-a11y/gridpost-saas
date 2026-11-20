'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { accounts, ai, posts, type ContentVariant, type PlanItem, type SocialAccountView } from '@/lib/api'

const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'telegram']

export default function AiStudio() {
  const [topic, setTopic] = useState('')
  const [selected, setSelected] = useState<string[]>(['instagram', 'facebook', 'linkedin', 'x'])
  const [weeks, setWeeks] = useState(2)
  const [variants, setVariants] = useState<ContentVariant[]>([])
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [list, setList] = useState<SocialAccountView[]>([])
  const [chosen, setChosen] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'content' | 'plan' | null>(null)

  useEffect(() => {
    void accounts.list().then((items) => {
      setList(items)
      setChosen(Object.fromEntries(items.map((item) => [item.id, true])))
    }).catch(() => undefined)
  }, [])

  function togglePlatform(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function generate(kind: 'content' | 'plan') {
    if (topic.trim().length < 3) return setMessage('Введите тему (от 3 символов)')
    setBusy(kind)
    setMessage('')
    try {
      if (kind === 'content') setVariants(await ai.content(topic, selected))
      else setPlan(await ai.plan(topic, weeks))
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function toDraft(variant: ContentVariant) {
    const targets = list
      .filter((item) => chosen[item.id] && item.platform === variant.platform)
      .map((item) => ({ accountId: item.id, lang: 'RU' }))
    if (!targets.length) {
      setMessage(`Нет выбранного аккаунта ${variant.platform}. Подключите его в Social Accounts.`)
      return
    }
    try {
      const draft = await ai.draft({ RU: [variant.text] }, targets)
      setMessage(`Черновик ${draft.id} создан. Публикация требует отдельного подтверждения.`)
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <>
      <h1>AI Studio</h1>
      <div className="card">
        <div className="col">
          <label className="small dim">Тема</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Например: продвижение нового ресторана в Милане" />
          <div className="row">
            {PLATFORMS.map((id) => (
              <button type="button" key={id} className={selected.includes(id) ? 'primary small' : 'ghost small'} onClick={() => togglePlatform(id)}>
                {id}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="primary" disabled={busy !== null} onClick={() => void generate('content')}>
              {busy === 'content' ? 'Генерируем…' : 'Создать контент'}
            </button>
            <input type="number" min={1} max={8} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} style={{ width: 70 }} />
            <button className="ghost" disabled={busy !== null} onClick={() => void generate('plan')}>
              {busy === 'plan' ? 'Планируем…' : 'Контент-план'}
            </button>
          </div>
        </div>
      </div>

      {message && <div className="card small">{message}</div>}
      <p className="dim small">AI никогда не публикует сам: результат сохраняется черновиком, отправку вы подтверждаете вручную.</p>

      {variants.length > 0 && (
        <>
          <h2>Варианты по площадкам</h2>
          <div className="stats">
            {variants.map((variant, index) => (
              <div className="card" key={`${variant.platform}-${index}`}>
                <div className="row"><span className="pill">{variant.platform}</span><strong>{variant.title}</strong></div>
                <p>{variant.text}</p>
                <div className="dim small">Крючок: {variant.hook}</div>
                <div className="dim small">CTA: {variant.cta}</div>
                <div className="row small" style={{ marginTop: 8 }}>
                  {variant.hashtags.map((tag) => <span className="pill" key={tag}>#{tag}</span>)}
                </div>
                <button className="small" style={{ marginTop: 10 }} onClick={() => void toDraft(variant)}>В черновик</button>
              </div>
            ))}
          </div>
        </>
      )}

      {plan.length > 0 && (
        <>
          <h2>Контент-план</h2>
          {plan.map((item, index) => (
            <div className="card row" key={index}>
              <span className="pill">день {item.day}</span>
              <span className="mono small">{item.suggestedTime}</span>
              <span className="pill">{item.platform}</span>
              <span className="grow">{item.topic}</span>
              <span className="dim small">{item.reason}</span>
            </div>
          ))}
        </>
      )}

      {list.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Аккаунты для черновика</h2>
          {list.map((item) => (
            <label className="row small" key={item.id} style={{ padding: '6px 0' }}>
              <input type="checkbox" checked={Boolean(chosen[item.id])} onChange={(e) => setChosen({ ...chosen, [item.id]: e.target.checked })} />
              <span className="pill">{item.platform}</span>
              <span className="grow">{item.displayName}</span>
            </label>
          ))}
          <Link className="small" href="/dashboard" style={{ color: 'var(--accent)' }}>Открыть черновики →</Link>
        </div>
      )}
    </>
  )
}
