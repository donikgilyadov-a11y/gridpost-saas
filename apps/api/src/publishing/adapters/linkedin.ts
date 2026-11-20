interface LinkedInRequest {
  token: string
  text: string
  authorUrn?: string
  imageUrl?: string
}

const API = process.env.LINKEDIN_API ?? 'https://api.linkedin.com/v2'

async function call<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers ?? {}) }
  })
  const data = (await response.json().catch(() => ({}))) as T & { message?: string }
  if (!response.ok) throw new Error(data.message ?? `LinkedIn HTTP ${response.status}`)
  return data
}

export async function publishLinkedIn(request: LinkedInRequest) {
  let author = request.authorUrn
  if (!author) {
    const info = await call<{ sub: string }>(`${API}/userinfo`, request.token)
    author = `urn:li:person:${info.sub}`
  }
  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: request.text },
    shareMediaCategory: request.imageUrl ? 'IMAGE' : 'NONE'
  }
  if (request.imageUrl) {
    shareContent.media = [{ status: 'READY', media: request.imageUrl, title: { text: 'Image' } }]
  }
  const result = await call<{ id: string }>(`${API}/ugcPosts`, request.token, {
    method: 'POST',
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    })
  })
  return { remoteId: result.id, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(result.id)}/` }
}
