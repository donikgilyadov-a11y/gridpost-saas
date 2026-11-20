export interface YouTubeRequest {
  token: string
  videoUrl: string
  title: string
  description?: string
  categoryId?: string
  privacyStatus?: 'public' | 'unlisted' | 'private'
}

/**
 * Fetches the video from S3 and performs a resumable upload to YouTube Data API.
 * Text-only publishing is impossible — this adapter requires a video URL.
 */
export async function publishYouTube(request: YouTubeRequest) {
  const base = process.env.YOUTUBE_API ?? 'https://www.googleapis.com/upload/youtube/v3'
  const video = await fetch(request.videoUrl)
  if (!video.ok) throw new Error(`Не удалось скачать видео из хранилища: HTTP ${video.status}`)
  const bytes = Buffer.from(await video.arrayBuffer())
  const mime = video.headers.get('content-type') ?? 'video/mp4'

  const init = await fetch(`${base}/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${request.token}`,
      'content-type': 'application/json',
      'x-upload-content-type': mime,
      'x-upload-content-length': String(bytes.length)
    },
    body: JSON.stringify({
      snippet: {
        title: request.title.slice(0, 100),
        description: request.description ?? '',
        categoryId: request.categoryId ?? '22'
      },
      status: { privacyStatus: request.privacyStatus ?? 'public' }
    })
  })
  if (!init.ok) {
    const error = (await init.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(error.error?.message ?? `YouTube init HTTP ${init.status}`)
  }
  const location = init.headers.get('location')
  if (!location) throw new Error('YouTube не вернул resumable session URL')

  const upload = await fetch(location, {
    method: 'PUT',
    headers: { 'content-type': mime, 'content-length': String(bytes.length) },
    body: bytes
  })
  if (!upload.ok) throw new Error(`YouTube upload HTTP ${upload.status}`)
  const data = (await upload.json().catch(() => ({}))) as { id?: string }
  if (!data.id) throw new Error('YouTube вернул пустой ответ')
  return { remoteId: data.id, url: `https://www.youtube.com/watch?v=${data.id}` }
}
