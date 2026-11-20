export interface FacebookRequest {
  token: string
  pageId: string
  thread: string[]
  link?: string
}

async function graph<T>(base: string, path: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: params.token ?? '' })
  body.delete('token')
  const response = await fetch(`${base}/${path}`, { method: 'POST', body })
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message: string } }
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `Facebook API HTTP ${response.status}`)
  return data
}

export async function publishFacebook(request: FacebookRequest) {
  const base = process.env.FACEBOOK_API ?? 'https://graph.facebook.com/v19.0'
  let firstId: string | undefined

  for (const text of request.thread) {
    const result = await graph<{ id: string }>(base, request.pageId + '/feed', {
      token: request.token,
      message: text,
      ...(request.link ? { link: request.link } : {})
    })
    if (!firstId) firstId = result.id
  }
  if (!firstId) throw new Error('Facebook вернул пустой ответ')
  return { remoteId: firstId, url: `https://www.facebook.com/${firstId}` }
}
