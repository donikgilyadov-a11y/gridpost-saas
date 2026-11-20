'use client'

import { useEffect, useState } from 'react'
import { analytics, type AnalyticsSummary, type Recommendation } from '@/lib/api'

const METRICS = ['reach', 'impressions', 'likes', 'comments', 'shares', 'clicks', 'followers']

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setSummary(await analytics.summary())
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => { void load() }, [])

  async function sync() {
    setBusy(true)
    setMessage('')
    try {
      const result = await analytics.sync()
      setMessage(`Синхронизировано снимков: ${result.synced}${result.errors.length ? `, ошибок: ${result.errors.length}` : ''}`)
      await load()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function recommend() {
    setBusy(true)
    try {
      setRecs(await analytics.recommendations())
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Analytics</h1>
      <div className="row">
        <button className="primary small" onClick={() => void sync()} disabled={busy}>Синхронизировать метрики</button>
        <button className="ghost small" onClick={() => void recommend()} disabled={busy}>AI-рекомендации</button>
      </div>
      {message && <div className="card small" style={{ marginTop: 12 }}>{message}</div>}

      {summary && (
        <>
          <div className="stats" style={{ marginTop: 18 }}>
            {METRICS.map((key) => (
              <div className="card" key={key}>
                <div className="dim small">{key}</div>
                <div className="stat">{summary.totals[key] ?? 0}</div>
              </div>
            ))}
            <div className="card"><div className="dim small">постов / опубликовано</div><div className="stat">{summary.totals.posts ?? 0} / {summary.totals.published ?? 0}</div></div>
          </div>

          <h2>По площадкам</h2>
          {!Object.keys(summary.byPlatform).length && <div className="card dim">Метрик пока нет — синхронизируйте после публикации.</div>}
          {Object.entries(summary.byPlatform).map(([platform, values]) => (
            <div className="card" key={platform}>
              <div className="row"><span className="pill">{platform}</span></div>
              <div className="row small dim" style={{ marginTop: 8 }}>
                {METRICS.map((key) => <span className="pill" key={key}>{key}: {values[key] ?? 0}</span>)}
              </div>
            </div>
          ))}
        </>
      )}

      {recs.length > 0 && (
        <>
          <h2>AI-рекомендации</h2>
          {recs.map((rec, index) => (
            <div className="card" key={index}>
              <div className="row">
                <span className={`pill ${rec.priority === 'high' ? 'err' : rec.priority === 'medium' ? 'warn' : ''}`}>{rec.priority}</span>
                <strong>{rec.title}</strong>
              </div>
              <p className="small">{rec.reason}</p>
              <div className="dim small">Действие: {rec.action}</div>
            </div>
          ))}
        </>
      )}
    </>
  )
}
