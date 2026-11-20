const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export interface AuthSession {
  token: string
  organizationId: string
  email: string
}

const KEY = 'gridpost.session'

export function session(): AuthSession | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

export function setSession(value: AuthSession): void {
  window.localStorage.setItem(KEY, JSON.stringify(value))
}

export function clearSession(): void {
  window.localStorage.removeItem(KEY)
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const current = session()
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(current ? { authorization: `Bearer ${current.token}` } : {}),
      ...(options.headers ?? {})
    }
  })
  const text = await response.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? (data as { message: string | string[] }).message
        : `HTTP ${response.status}`
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message))
  }
  return data as T
}

export interface PostTargetView {
  id: string
  accountId: string
  lang: string
  status: string
  attempts: number
  remoteId: string | null
  url: string | null
  error: string | null
}

export interface PostView {
  id: string
  variants: Record<string, string[]>
  status: string
  scheduledAt: string | null
  createdAt: string
  targets: PostTargetView[]
}

export interface SocialAccountView {
  id: string
  platform: string
  displayName: string
  externalId: string
  status: string
  metadata: Record<string, unknown>
}

export const posts = {
  list: () => api<PostView[]>('/posts'),
  create: (body: unknown) => api<PostView>('/posts', { method: 'POST', body: JSON.stringify(body) }),
  retry: (id: string) => api<PostView>(`/posts/${id}/retry`, { method: 'POST' })
}

export const accounts = {
  list: () => api<SocialAccountView[]>('/social-accounts'),
  connect: (body: unknown) => api<SocialAccountView>('/social-accounts/connect', { method: 'POST', body: JSON.stringify(body) }),
  oauthUrl: (platform: string) => api<string>(`/oauth/${platform}/url`)
}
