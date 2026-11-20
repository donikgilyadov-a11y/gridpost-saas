import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SecretsService } from '../secrets/secrets.service'
import { AiService, type Recommendation } from '../ai/ai.service'
import { fetchFacebookStats } from '../publishing/adapters/facebook'
import { fetchInstagramStats } from '../publishing/adapters/instagram'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly ai: AiService
  ) {}

  /** Pulls metrics from platform APIs for published targets that have a remote id. */
  async sync(organizationId: string, postId?: string): Promise<{ synced: number; errors: string[] }> {
    const targets = await this.prisma.withOrg(organizationId, (tx) =>
      tx.postTarget.findMany({
        where: {
          organizationId,
          status: 'PUBLISHED',
          remoteId: { not: null },
          ...(postId ? { postId } : {})
        },
        include: { socialAccount: true },
        orderBy: { publishedAt: 'desc' },
        take: 50
      })
    )

    const errors: string[] = []
    let synced = 0
    for (const target of targets) {
      const account = target.socialAccount
      if (!account || !target.remoteId || !['facebook', 'instagram'].includes(account.platform)) continue
      try {
        const token = await this.secrets.decrypt(organizationId, {
          cipher: account.tokenCipher,
          iv: account.tokenIv,
          keyVersion: account.keyVersion
        })
        const raw =
          account.platform === 'facebook'
            ? await fetchFacebookStats(token, target.remoteId)
            : await fetchInstagramStats(token, target.remoteId)
        await this.prisma.withOrg(organizationId, (tx) =>
          tx.metricSnapshot.create({
            data: {
              organizationId,
              postId: target.postId,
              accountId: target.accountId,
              platform: account.platform,
              impressions: raw.impressions ?? null,
              reach: raw.reach ?? null,
              likes: 'likes' in raw ? (raw.likes ?? null) : null,
              comments: 'comments' in raw ? (raw.comments ?? null) : null,
              shares: 'shares' in raw ? (raw.shares ?? null) : ('engagements' in raw ? (raw.engagements ?? null) : null),
              clicks: null,
              followers: null,
              ctr: null
            }
          })
        )
        synced += 1
      } catch (error) {
        const message = `${account.platform}/${target.id}: ${(error as Error).message}`
        errors.push(message)
        this.logger.warn(message)
      }
    }
    return { synced, errors }
  }

  async summary(organizationId: string) {
    const snapshots = await this.prisma.withOrg(organizationId, (tx) =>
      tx.metricSnapshot.findMany({
        where: { organizationId },
        orderBy: { capturedAt: 'desc' },
        take: 200
      })
    )
    const keys = ['reach', 'impressions', 'likes', 'comments', 'shares', 'clicks', 'followers'] as const
    const add = (target: Record<string, number>, snapshot: (typeof snapshots)[number]) => {
      for (const key of keys) target[key] += snapshot[key] ?? 0
    }
    const totals = Object.fromEntries(keys.map((key) => [key, 0])) as Record<string, number>
    const byPlatform = new Map<string, Record<string, number>>()
    for (const snapshot of snapshots) {
      add(totals, snapshot)
      const platform = byPlatform.get(snapshot.platform) ?? Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>
      add(platform, snapshot)
      byPlatform.set(snapshot.platform, platform)
    }

    const posts = await this.prisma.withOrg(organizationId, (tx) =>
      tx.post.findMany({
        where: { organizationId },
        select: { id: true, status: true, variants: true, createdAt: true, scheduledAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    )
    const published = posts.filter((post) => post.status === 'PUBLISHED').length
    return {
      totals: { ...totals, posts: posts.length, published },
      byPlatform: Object.fromEntries(byPlatform),
      recent: snapshots.slice(0, 20)
    }
  }

  async recommendations(organizationId: string): Promise<Recommendation[]> {
    return this.ai.recommendations(await this.summary(organizationId))
  }
}
