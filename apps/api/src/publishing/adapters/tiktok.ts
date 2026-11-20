export interface TikTokRequest {
  token: string
  videoUrl: string
  title: string
}

interface TikTokResponse<T> {
  data?: T
  error?: { code?: string; message?: string }
}

/**
 * TikTok Content Posting API (PULL_URL): server provides a public video URL,
 * then we poll publish_id until the platform finishes processing.
 */
export async function publishTikTok(request: TikTokRequest) {
  const base = process.env.TIKTOK_API ?? 'https://open.tiktokapis.com/v2'
  const initResponse = await fetch(`${base}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${request.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      post_info: {
        title: request.title.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false
      },
      source_info: { source: 'PULL_URL', video_url: request.videoUrl }
    })
  })
  const init = (await initResponse.json().catch(() => ({}))) as TikTokResponse<{ publish_id?: string }>
  if (!initResponse.ok || !init.data?.publish_id) {
    throw new Error(init.error?.message ?? `TikTok init HTTP ${initResponse.status}`)
  }
  const publishId = init.data.publish_id

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const statusResponse = await fetch(`${base}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: { authorization: `Bearer ${request.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ publish_id: publishId })
    })
    const status = (await statusResponse.json().catch(() => ({}))) as TikTokResponse<{
      status?: string
      publicaly_available_post_id?: string[]
    }>
    if (!statusResponse.ok) throw new Error(status.error?.message ?? `TikTok status HTTP ${statusResponse.status}`)
    if (status.data?.status === 'PUBLISH_COMPLETE') {
      const id = status.data.publicaly_available_post_id?.[0] ?? publishId
      return { remoteId: id, url: `https://www.tiktok.com/video/${id}` }
    }
    if (status.data?.status === 'FAILED') throw new Error('TikTok отклонил публикацию видео')
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error('TikTok не подтвердил публикацию вовремя')
}
