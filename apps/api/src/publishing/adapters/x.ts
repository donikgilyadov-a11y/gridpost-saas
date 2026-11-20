interface XRequest {
  token: string
  thread: string[]
}

const API = process.env.X_API ?? 'https://api.x.com/2'

export async function publishX(request: XRequest) {
  let replyId: string | undefined
  let firstId: string | undefined
  for (const text of request.thread) {
    const response = await fetch(`${API}/tweets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${request.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text, ...(replyId ? { reply: { in_reply_to_tweet_id: replyId } } : {}) })
    })
    const data = (await response.json().catch(() => ({}))) as {
      data?: { id: string }
      errors?: Array<{ message: string }>
      title?: string
    }
    if (!response.ok) throw new Error(data.errors?.map((e) => e.message).join(', ') ?? data.title ?? `X HTTP ${response.status}`)
    if (!data.data?.id) throw new Error('X вернул пустой ответ')
    if (!firstId) firstId = data.data.id
    replyId = data.data.id
  }
  if (!firstId) throw new Error('Не удалось опубликовать тред')
  return { remoteId: firstId, url: `https://x.com/i/status/${firstId}` }
}
