export type PlatformId =
  | 'telegram'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'x'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'bluesky'
  | 'mastodon'
  | 'threads'

export type PostStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'SKIPPED'

export type TargetStatus = 'PENDING' | 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'SKIPPED'

export const PLATFORM_PRIORITY: Record<PlatformId, 0 | 1 | 2> = {
  telegram: 0,
  facebook: 0,
  instagram: 0,
  linkedin: 1,
  x: 1,
  youtube: 1,
  tiktok: 1,
  pinterest: 2,
  bluesky: 2,
  mastodon: 2,
  threads: 2
}

export interface PlatformCapabilities {
  text: boolean
  images: boolean
  video: boolean
  threads: boolean
  scheduling: 'native' | 'server' | 'none'
  analytics: boolean
  note?: string
}

/** Verified against official APIs — capabilities differ per network. */
export const PLATFORM_CAPABILITIES: Record<PlatformId, PlatformCapabilities> = {
  telegram: { text: true, images: true, video: true, threads: true, scheduling: 'server', analytics: false, note: 'Bot API не умеет отложенный постинг' },
  facebook: { text: true, images: true, video: true, threads: false, scheduling: 'native', analytics: true },
  instagram: { text: true, images: true, video: true, threads: false, scheduling: 'native', analytics: true, note: 'Business-аккаунт + Graph API; TEXT media_type доступен не везде' },
  linkedin: { text: true, images: true, video: true, threads: false, scheduling: 'none', analytics: true },
  x: { text: true, images: true, video: true, threads: true, scheduling: 'none', analytics: true, note: 'API v2 не умеет отложенный постинг' },
  youtube: { text: false, images: false, video: true, threads: false, scheduling: 'native', analytics: true, note: 'Нужен resumable video upload — S3-пайплайн в следующей итерации' },
  tiktok: { text: false, images: false, video: true, threads: false, scheduling: 'none', analytics: true, note: 'Content Posting API: видео/фото + polling publish_id; текстовые посты недоступны' },
  pinterest: { text: true, images: true, video: true, threads: false, scheduling: 'native', analytics: true },
  bluesky: { text: true, images: true, video: true, threads: true, scheduling: 'server', analytics: false },
  mastodon: { text: true, images: true, video: true, threads: true, scheduling: 'native', analytics: false },
  threads: { text: true, images: true, video: true, threads: true, scheduling: 'none', analytics: true }
}

export const PLAN_LIMITS = {
  free: { accounts: 2, postsPerMonth: 30 },
  starter: { accounts: 5, postsPerMonth: 300 },
  pro: { accounts: 15, postsPerMonth: 1500 },
  business: { accounts: 40, postsPerMonth: 6000 },
  agency: { accounts: 100, postsPerMonth: 20000 },
  enterprise: { accounts: Number.MAX_SAFE_INTEGER, postsPerMonth: Number.MAX_SAFE_INTEGER }
} as const

export type PlanId = keyof typeof PLAN_LIMITS

export interface PublishJobPayload {
  organizationId: string
  postId: string
  targetId: string
  accountId: string
  platform: PlatformId
  lang: string
  /** Stable across retries; used for de-duplication. */
  idempotencyKey: string
  scheduledAt?: string
}

export function makeIdempotencyKey(
  organizationId: string,
  postId: string,
  targetId: string,
  window: string
): string {
  return [organizationId, postId, targetId, window].join(':')
}
