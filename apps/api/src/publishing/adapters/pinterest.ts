interface PinterestRequest {
  token: string
  boardId: string
  title: string
  description: string
  imageUrl: string
  link?: string
}

const API = process.env.PINTEREST_API ?? 'https://api.pinterest.com/v5'

export async function publishPinterest(request: PinterestRequest) {
  const response = await fetch(`${API}/pins`, {
    method: 'POST',
    headers: { authorization: `Bearer ${request.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      board_id: request.boardId,
      title: request.title,
      description: request.description,
      link: request.link,
      media_source: { source_type: 'image_url', url: request.imageUrl }
    })
  })
  const data = (await response.json().catch(() => ({}))) as {
    id?: string
    pin_link?: string
    message?: string
  }
  if (!response.ok) throw new Error(data.message ?? `Pinterest HTTP ${response.status}`)
  if (!data.id) throw new Error('Pinterest вернул пустой ответ')
  return { remoteId: data.id, url: data.pin_link }
}
