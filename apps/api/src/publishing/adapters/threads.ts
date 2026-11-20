interface ThreadsRequest {
  token: string
  userId: string
  text: string
  imageUrl?: string
}

const API = process.env.THREADS_API ?? 'https://graph.threads.net/v1.0'

export async function publishThreads(request: ThreadsRequest) {
  const params = new URLSearchParams({ text: request.text, access_token: request.token })
  if (request.imageUrl) params.set('image_url', request.imageUrl)
  const created = await fetch(`${API}/${request.userId}/threads`, { method: 'POST', body: params })
  const container = (await created.json().catch(() => ({}))) as { id?: string; error?: { message: string } }
  if (!created.ok || !container.id) throw new Error(container.error?.message ?? `Threads HTTP ${created.status}`)

  const published = await fetch(`${API}/${request.userId}/threads_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: container.id, access_token: request.token })
  })
  const data = (await published.json().catch(() => ({}))) as { id?: string; permalink?: string; error?: { message: string } }
  if (!published.ok || !data.id) throw new Error(data.error?.message ?? `Threads publish HTTP ${published.status}`)
  return { remoteId: data.id, url: data.permalink }
}
