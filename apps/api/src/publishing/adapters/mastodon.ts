interface MastodonRequest {
  token: string
  host: string
  thread: string[]
  scheduledAt?: Date
  lang?: string
}

export async function publishMastodon(request: MastodonRequest) {
  const scheme = process.env.MASTODON_SCHEME ?? 'https'
  const base = `${scheme}://${request.host.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/v1`
  let replyId: string | undefined
  let first: { id: string; url?: string } | undefined
  for (const text of request.thread) {
    const body = new URLSearchParams({
      status: text,
      ...(replyId ? { in_reply_to_id: replyId } : {}),
      ...(request.lang ? { language: request.lang } : {}),
      ...(request.scheduledAt && !replyId ? { scheduled_at: request.scheduledAt.toISOString() } : {})
    })
    const response = await fetch(`${base}/statuses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${request.token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body
    })
    const data = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: string; scheduled_at?: string }
    if (!response.ok) throw new Error(data.error ?? `Mastodon HTTP ${response.status}`)
    if (!data.id) throw new Error('Mastodon вернул пустой ответ')
    if (!first) first = { id: data.id, url: data.url }
    replyId = data.id
  }
  if (!first) throw new Error('Не удалось опубликовать статус')
  return { remoteId: first.id, url: first.url, nativeScheduling: Boolean(request.scheduledAt) }
}
