export interface InstagramRequest {
  token: string
  igUserId: string
  caption: string
  /** Public URL: S3 bucket in P3, user-provided mirror in the meantime. */
  imageUrl?: string
  videoUrl?: string
}

interface GraphResult {
  id?: string
  shortcode?: string
  status_code?: string
  error?: { message: string }
}

async function api(base: string, path: string, params: Record<string, string>, method = 'POST'): Promise<GraphResult> {
  const body = new URLSearchParams({ ...params, access_token: params.token ?? '' })
  body.delete('token')
  const url = method === 'GET' ? `${base}/${path}&access_token=${encodeURIComponent(params.token)}` : `${base}/${path}`
  const response = await fetch(url, { method, ...(method === 'POST' ? { body } : {}) })
  const data = (await response.json().catch(() => ({}))) as GraphResult
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `Instagram API HTTP ${response.status}`)
  return data
}

export async function publishInstagram(request: InstagramRequest) {
  const base = process.env.INSTAGRAM_API ?? 'https://graph.facebook.com/v19.0'
  const mediaParams: Record<string, string> = { token: request.token, caption: request.caption }
  if (request.imageUrl) mediaParams.image_url = request.imageUrl
  else if (request.videoUrl) {
    mediaParams.media_type = 'VIDEO'
    mediaParams.video_url = request.videoUrl
  } else {
    mediaParams.media_type = 'TEXT'
  }

  const media = await api(base, `${request.igUserId}/media`, mediaParams)
  if (!media.id) throw new Error('Instagram не вернул creation id')

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await api(base, `${media.id}?fields=status_code`, { token: request.token }, 'GET')
    if (status.status_code === 'FINISHED') break
    if (status.status_code === 'ERROR') throw new Error('Instagram не смог подготовить медиа')
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const published = await api(base, `${request.igUserId}/media_publish`, {
    token: request.token,
    creation_id: media.id
  })
  const remoteId = published.id ?? media.id
  let url: string | undefined
  try {
    const info = await api(base, `${remoteId}?fields=shortcode`, { token: request.token }, 'GET')
    if (info.shortcode) url = `https://www.instagram.com/p/${info.shortcode}/`
  } catch {
    // shortcode is optional
  }
  return { remoteId, url }
}
