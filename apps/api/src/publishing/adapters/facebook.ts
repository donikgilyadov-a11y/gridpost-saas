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

export async function fetchFacebookStats(token: string, remoteId: string) {
  const base = process.env.FACEBOOK_API ?? 'https://graph.facebook.com/v19.0'
  const response = await fetch(
    `${base}/${remoteId}/insights?metric=post_impressions,post_reach,post_engaged_users&access_token=${encodeURIComponent(token)}`
  )
  const data = (await response.json().catch(() => ({}))) as {
    data?: Array<{ name: string; values?: Array<{ value: number }> }>
    error?: { message: string }
  }
  if (!response.ok) throw new Error(data.error?.message ?? `Facebook Insights HTTP ${response.status}`)
  const value = (name: string) => data.data?.find((item) => item.name === name)?.values?.[0]?.value
  return { impressions: value('post_impressions'), reach: value('post_reach'), engagements: value('post_engaged_users') }
}
