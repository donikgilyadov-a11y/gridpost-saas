'use client'

import { useEffect, useState } from 'react'
import { ai, api, security, type BrandVoice } from '@/lib/api'

interface Org { id: string; name: string; slug: string; plan: string; timezone: string }

export default function SettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [voice, setVoice] = useState<BrandVoice | null>(null)
  const [mfaSecret, setMfaSecret] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [members, setMembers] = useState<Array<{ id: string; role: string; user: { email: string; displayName: string } }>>([])
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => {
    void api<Org>('/organizations/current').then(setOrg).catch((err: Error) => setMessage(err.message))
    void ai.voice().then(setVoice).catch(() => undefined)
    void loadMembers()
  }, [])

  async function loadMembers() {
    try {
      const list = await api<Array<{ id: string; role: string; user: { email: string; displayName: string } }>>('/organizations/current/members')
      setMembers(list)
    } catch {
      setMembers([])
    }
  }

  async function invite() {
    try {
      await api('/organizations/current/members', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: 'MEMBER' })
      })
      setInviteEmail('')
      await loadMembers()
      setMessage('Участник добавлен')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  async function saveVoice() {
    if (!voice) return
    setBusy(true)
    try {
      setVoice(await ai.saveVoice(voice))
      setMessage('Голос бренда сохранён')
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadData() {
    try {
      const data = await security.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'gridpost-export.json'
      link.click()
      URL.revokeObjectURL(link.href)
      setMessage('Данные экспортированы')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  async function applyMfa(enable: boolean) {
    try {
      if (enable) {
        const result = await security.mfaEnable(mfaCode)
        setMessage(result.enabled ? 'MFA включён' : 'Не удалось включить MFA')
      } else {
        const result = await security.mfaDisable(mfaCode)
        setMessage(result.enabled ? 'Не удалось выключить MFA' : 'MFA выключен')
      }
      setMfaCode('')
      setMfaSecret('')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  async function rotate() {
    setBusy(true)
    setMessage('')
    try {
      const result = await api<{ version: number; rotated: number; failed: string[] }>(
        '/organizations/current/rotate-keys',
        { method: 'POST', body: '{}' }
      )
      setMessage(`Ротация → v${result.version}: перешифровано ${result.rotated}, ошибок ${result.failed.length}. Повторный вызов продолжит незавершённые записи.`)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <h2>Организация</h2>
        {org ? (
          <div className="col small">
            <div>Название: <strong>{org.name}</strong></div>
            <div>Slug: <span className="mono">{org.slug}</span></div>
            <div>Тариф: <span className="pill">{org.plan}</span></div>
            <div>Часовой пояс: <span className="mono">{org.timezone}</span></div>
          </div>
        ) : <div className="dim">Загрузка…</div>}
      </div>
      <div className="card">
        <h2>Команда</h2>
        <div className="row">
          <input placeholder="email пользователя" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <button className="primary small" onClick={() => void invite()}>Добавить</button>
        </div>
        <div style={{ marginTop: 10 }}>
          {members.map((member) => (
            <div className="row small" key={member.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="grow">{member.user.displayName} · {member.user.email}</span>
              <span className="pill">{member.role}</span>
              {member.role !== 'OWNER' && (
                <>
                  <button
                    className="ghost small"
                    onClick={() => void api(`/organizations/current/members/${member.id}/role`, {
                      method: 'POST',
                      body: JSON.stringify({ role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' })
                    }).then(() => loadMembers())}
                  >
                    смена роли
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => void api(`/organizations/current/members/${member.id}`, { method: 'DELETE' }).then(() => loadMembers())}
                  >
                    удалить
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>Голос бренда</h2>
        {voice ? (
          <div className="col">
            <label className="small dim">Тон
              <input value={voice.tone} onChange={(e) => setVoice({ ...voice, tone: e.target.value })} />
            </label>
            <label className="small dim">Аудитория
              <input value={voice.audience} onChange={(e) => setVoice({ ...voice, audience: e.target.value })} />
            </label>
            <label className="small dim">Язык
              <input value={voice.language} onChange={(e) => setVoice({ ...voice, language: e.target.value })} />
            </label>
            <label className="small dim">Желаемая длина
              <input type="number" value={voice.preferredLength} onChange={(e) => setVoice({ ...voice, preferredLength: Number(e.target.value) })} />
            </label>
            <label className="small dim">Запрещённые слова (через запятую)
              <input value={voice.forbiddenWords.join(', ')} onChange={(e) => setVoice({ ...voice, forbiddenWords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </label>
            <label className="small dim">Фирменные выражения (через запятую)
              <input value={voice.phrases.join(', ')} onChange={(e) => setVoice({ ...voice, phrases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </label>
            <button className="primary small" onClick={() => void saveVoice()} disabled={busy}>Сохранить голос бренда</button>
          </div>
        ) : <div className="dim small">Загрузка…</div>}
      </div>
      <div className="card">
        <h2>Двухфакторная аутентификация</h2>
        <p className="dim small">TOTP-код из приложения-аутентификатора. После включения он требуется при каждом входе.</p>
        <div className="row">
          <button className="ghost small" onClick={() => void security.mfaSetup().then((r) => { setMfaSecret(r.secret); setMessage('Секрет добавлен в приложение: ' + r.otpauthUrl) }).catch((e: Error) => setMessage(e.message))}>
            Показать секрет
          </button>
          {mfaSecret && <span className="mono small">{mfaSecret}</span>}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input placeholder="6-значный код" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={6} style={{ width: 150 }} />
          <button className="primary small" onClick={() => void applyMfa(true)}>Включить</button>
          <button className="ghost small" onClick={() => void applyMfa(false)}>Выключить</button>
        </div>
      </div>
      <div className="card">
        <h2>Данные и приватность (GDPR)</h2>
        <div className="row">
          <button className="ghost small" onClick={() => void downloadData()}>Экспортировать данные</button>
          <button
            className="ghost small"
            onClick={() => {
              if (window.confirm('Удалить организацию и все её данные? Это необратимо.')) {
                void security.deleteOrganization().then(() => { window.location.href = '/' }).catch((e: Error) => setMessage(e.message))
              }
            }}
          >
            Удалить организацию
          </button>
        </div>
      </div>
      <div className="card">
        <h2>Безопасность</h2>
        <p className="dim small">Ротация создаёт новый ключ организации и перешифровывает все сохранённые токены.</p>
        <button className="primary small" onClick={() => void rotate()} disabled={busy}>
          {busy ? 'Ротация…' : 'Ротировать ключ'}
        </button>
      </div>
      {message && <div className="card small">{message}</div>}
    </>
  )
}
