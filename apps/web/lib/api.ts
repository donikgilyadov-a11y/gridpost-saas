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
  retry: (id: string) => api<PostView>(`/posts/${id}/retry`, { method: 'POST' }),
  publish: (id: string) => api<PostView>(`/posts/${id}/publish`, { method: 'POST' })
}

export const accounts = {
  list: () => api<SocialAccountView[]>('/social-accounts'),
  connect: (body: unknown) => api<SocialAccountView>('/social-accounts/connect', { method: 'POST', body: JSON.stringify(body) }),
  oauthUrl: (platform: string) => api<string>(`/oauth/${platform}/url`)
}

export interface ContentVariant {
  platform: string
  title: string
  text: string
  hook: string
  hashtags: string[]
  cta: string
}

export interface PlanItem {
  day: number
  platform: string
  topic: string
  reason: string
  suggestedTime: string
}

export interface BrandVoice {
  tone: string
  audience: string
  forbiddenWords: string[]
  phrases: string[]
  language: string
  preferredLength: number
}

export interface AnalyticsSummary {
  totals: Record<string, number>
  byPlatform: Record<string, Record<string, number>>
  recent: Array<{ platform: string; capturedAt: string; reach: number | null; impressions: number | null; likes: number | null }>
}

export interface Recommendation {
  title: string
  reason: string
  action: string
  priority: 'high' | 'medium' | 'low'
}

export interface Subscription {
  plan: string
  status: string
  limits: { accounts: number; postsPerMonth: number }
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface PlanInfo {
  id: string
  accounts: number
  postsPerMonth: number
}

export const billing = {
  plans: () => api<PlanInfo[]>('/billing/plans'),
  subscription: () => api<Subscription>('/billing/subscription'),
  checkout: (plan: string) =>
    api<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  portal: () => api<{ url: string }>('/billing/portal', { method: 'POST', body: '{}' })
}

export const analytics = {
  summary: () => api<AnalyticsSummary>('/analytics/summary'),
  sync: () => api<{ synced: number; errors: string[] }>('/analytics/sync', { method: 'POST', body: '{}' }),
  recommendations: () => api<Recommendation[]>('/analytics/recommendations')
}

export const ai = {
  content: (topic: string, platforms: string[]) =>
    api<ContentVariant[]>('/ai/content', { method: 'POST', body: JSON.stringify({ topic, platforms }) }),
  plan: (topic: string, weeks: number) =>
    api<PlanItem[]>('/ai/plan', { method: 'POST', body: JSON.stringify({ topic, weeks }) }),
  draft: (variants: Record<string, string[]>, targets: { accountId: string; lang: string }[]) =>
    api<PostView>('/ai/drafts', { method: 'POST', body: JSON.stringify({ variants, targets }) }),
  voice: () => api<BrandVoice>('/ai/brand-voice'),
  saveVoice: (voice: BrandVoice) =>
    api<BrandVoice>('/ai/brand-voice', { method: 'PUT', body: JSON.stringify(voice) })
}
