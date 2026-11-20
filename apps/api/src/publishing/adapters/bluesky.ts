interface BlueskyRequest {
  token: string
  handle: string
  thread: string[]
  pds?: string
}

interface RecordRef {
  uri: string
  cid: string
}

async function xrpc<T>(base: string, method: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}/xrpc/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!response.ok) throw new Error(data.message ?? data.error ?? `Bluesky HTTP ${response.status}`)
  return data
}

export async function publishBluesky(request: BlueskyRequest) {
  const base = (request.pds ?? 'https://bsky.social').replace(/\/$/, '')
  const identity = await xrpc<{ did: string }>(base, 'com.atproto.identity.resolveHandle', request.token)
  if (!identity.did) throw new Error('Не удалось получить DID аккаунта Bluesky')

  let root: RecordRef | undefined
  let parent: RecordRef | undefined
  let firstUri: string | undefined
  for (const text of request.thread) {
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      langs: ['ru', 'en']
    }
    if (root && parent) {
      record.reply = {
        root: { uri: root.uri, cid: root.cid },
        parent: { uri: parent.uri, cid: parent.cid }
      }
    }
    const created = await xrpc<RecordRef>(base, 'com.atproto.repo.createRecord', request.token, {
      repo: identity.did,
      collection: 'app.bsky.feed.post',
      record
    })
    if (!root) root = created
    parent = created
    if (!firstUri) firstUri = created.uri
  }
  if (!firstUri) throw new Error('Bluesky вернул пустой ответ')
  const match = firstUri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)/)
  return {
    remoteId: firstUri,
    url: match ? `https://bsky.app/profile/${match[1]}/post/${match[2]}` : undefined
  }
}
