import { Injectable, Logger } from '@nestjs/common'
import { Prisma, TargetStatus } from '@prisma/client'
import { UnrecoverableError } from 'bullmq'
import type { PublishJobPayload } from '@gridpost/shared'
import { PrismaService } from '../prisma/prisma.service'
import { SecretsService } from '../secrets/secrets.service'
import { publishTelegram } from './adapters/telegram'
import { publishFacebook } from './adapters/facebook'
import { publishInstagram } from './adapters/instagram'
import { publishLinkedIn } from './adapters/linkedin'
import { publishX } from './adapters/x'
import { publishBluesky } from './adapters/bluesky'
import { publishMastodon } from './adapters/mastodon'
import { publishThreads } from './adapters/threads'
import { publishPinterest } from './adapters/pinterest'
import { publishYouTube } from './adapters/youtube'
import { publishTikTok } from './adapters/tiktok'

interface VariantMap {
  [lang: string]: string[]
}

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService
  ) {}

  async process(payload: PublishJobPayload): Promise<void> {
    const targetBefore = await this.prisma.postTarget.findUnique({ where: { id: payload.targetId } })
    if (!targetBefore) throw new UnrecoverableError('PostTarget not found')
    // Idempotency: a published target is never sent twice, even if the job repeats.
    if (targetBefore.status === 'PUBLISHED') {
      this.logger.log(`target ${payload.targetId} already published — skipping`)
      return
    }

    const claimed = await this.prisma.withOrg(payload.organizationId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE post_targets
        SET status = 'PUBLISHING', attempts = attempts + 1, updated_at = now()
        WHERE id = ${payload.targetId}::uuid
          AND organization_id = ${payload.organizationId}::uuid
          AND status IN ('PENDING', 'QUEUED', 'FAILED')
        RETURNING id
      `
      return rows.length > 0
    })
    if (!claimed) {
      this.logger.warn(`target ${payload.targetId} not claimable — another worker owns it`)
      return
    }

    try {
      const account = await this.prisma.withOrg(payload.organizationId, (tx) =>
        tx.socialAccount.findUniqueOrThrow({ where: { id: payload.accountId } })
      )
      const post = await this.prisma.withOrg(payload.organizationId, (tx) =>
        tx.post.findUniqueOrThrow({ where: { id: payload.postId } })
      )

      if (account.status !== 'ACTIVE') {
        throw new UnrecoverableError(`Social account is ${account.status}`)
      }
      if (account.expiresAt && account.expiresAt.getTime() < Date.now()) {
        await this.prisma.withOrg(payload.organizationId, (tx) =>
          tx.socialAccount.update({ where: { id: account.id }, data: { status: 'EXPIRED' } })
        )
        throw new UnrecoverableError('OAuth token expired — reconnect the account')
      }

      const metadata = account.metadata as Record<string, unknown>
      const token = await this.secrets.decrypt(payload.organizationId, {
        cipher: account.tokenCipher,
        iv: account.tokenIv,
        keyVersion: account.keyVersion
      })
      const variants = post.variants as unknown as VariantMap
      const thread = variants[payload.lang] ?? Object.values(variants)[0] ?? []
      const media = (post.media as unknown as Array<{ url: string; mime: string; alt?: string }>) ?? []
      const imageUrl = media.find((item) => item.mime.startsWith('image/'))?.url
      const videoUrl = media.find((item) => item.mime.startsWith('video/'))?.url

      let outcome: { remoteId: string; url?: string }
      switch (payload.platform) {
        case 'telegram': {
          if (typeof metadata.chatId !== 'string') throw new UnrecoverableError('Telegram chatId is missing')
          outcome = await publishTelegram({ token, chatId: metadata.chatId, thread })
          break
        }
        case 'facebook': {
          if (typeof metadata.pageId !== 'string') throw new UnrecoverableError('Facebook pageId is missing')
          outcome = await publishFacebook({ token, pageId: metadata.pageId, thread })
          break
        }
        case 'instagram': {
          if (typeof metadata.igUserId !== 'string') throw new UnrecoverableError('Instagram igUserId is missing')
          outcome = await publishInstagram({
            token,
            igUserId: metadata.igUserId,
            caption: thread.join('\n\n'),
            ...(imageUrl ? { imageUrl } : typeof metadata.imageUrl === 'string' ? { imageUrl: metadata.imageUrl } : {}),
            ...(videoUrl ? { videoUrl } : {})
          })
          break
        }
        case 'linkedin': {
          outcome = await publishLinkedIn({
            token,
            text: thread.join('\n\n'),
            ...(typeof metadata.authorUrn === 'string' ? { authorUrn: metadata.authorUrn } : {}),
            ...(imageUrl ? { imageUrl } : typeof metadata.imageUrl === 'string' ? { imageUrl: metadata.imageUrl } : {})
          })
          break
        }
        case 'x': {
          outcome = await publishX({ token, thread })
          break
        }
        case 'bluesky': {
          if (typeof metadata.handle !== 'string') throw new UnrecoverableError('Bluesky handle is missing')
          outcome = await publishBluesky({
            token,
            handle: metadata.handle,
            thread,
            ...(typeof metadata.pds === 'string' ? { pds: metadata.pds } : {})
          })
          break
        }
        case 'mastodon': {
          if (typeof metadata.host !== 'string') throw new UnrecoverableError('Mastodon host is missing')
          const result = await publishMastodon({
            token,
            host: metadata.host,
            thread,
            lang: payload.lang,
            ...(payload.scheduledAt ? { scheduledAt: new Date(payload.scheduledAt) } : {})
          })
          outcome = { remoteId: result.remoteId, url: result.url }
          break
        }
        case 'threads': {
          if (typeof metadata.userId !== 'string') throw new UnrecoverableError('Threads userId is missing')
          outcome = await publishThreads({
            token,
            userId: metadata.userId,
            text: thread.join('\n\n'),
            ...(imageUrl ? { imageUrl } : {})
          })
          break
        }
        case 'pinterest': {
          const boardId = metadata.boardId
          const pinImage = imageUrl ?? (typeof metadata.imageUrl === 'string' ? metadata.imageUrl : undefined)
          if (typeof boardId !== 'string' || !pinImage) {
            throw new UnrecoverableError('Pinterest boardId and imageUrl are required')
          }
          outcome = await publishPinterest({
            token,
            boardId,
            title: thread[0]?.slice(0, 100) ?? 'Gridpost',
            description: thread.join('\n\n'),
            imageUrl: pinImage
          })
          break
        }
        case 'youtube': {
          if (!videoUrl) throw new UnrecoverableError('YouTube требует видео в медиатеке поста')
          outcome = await publishYouTube({
            token,
            videoUrl,
            title: thread[0]?.slice(0, 100) ?? 'Gridpost',
            description: thread.join('\n\n')
          })
          break
        }
        case 'tiktok': {
          if (!videoUrl) throw new UnrecoverableError('TikTok требует видео в медиатеке поста')
          outcome = await publishTikTok({ token, videoUrl, title: thread[0] ?? 'Gridpost' })
          break
        }
        default:
          throw new UnrecoverableError(`Platform ${payload.platform} has no adapter`)
      }
      await this.finish(payload, 'PUBLISHED', outcome.remoteId, outcome.url)
      this.logger.log(`published ${payload.targetId} → ${outcome.remoteId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const permanent =
        error instanceof UnrecoverableError ||
        (error instanceof Error && error.name === 'PermanentAdapterError') ||
        /HTTP 4\d\d(?!\s*429)/.test(message)
      await this.finish(payload, 'FAILED', undefined, undefined, message)
      if (permanent) throw new UnrecoverableError(message)
      throw error
    }
  }

  private async finish(
    payload: PublishJobPayload,
    status: TargetStatus,
    remoteId?: string,
    url?: string,
    error?: string
  ): Promise<void> {
    await this.prisma.withOrg(payload.organizationId, async (tx) => {
      await tx.postTarget.update({
        where: { id: payload.targetId },
        data: {
          status,
          remoteId,
          url,
          error,
          publishedAt: status === 'PUBLISHED' ? new Date() : null
        }
      })
      await this.refreshPostStatus(tx, payload.postId)
    })
  }

  private async refreshPostStatus(tx: Prisma.TransactionClient, postId: string): Promise<void> {
    const targets = await tx.postTarget.findMany({ where: { postId } })
    const status = targets.every((t) => t.status === 'PUBLISHED')
      ? 'PUBLISHED'
      : targets.some((t) => t.status === 'PUBLISHING' || t.status === 'QUEUED' || t.status === 'PENDING')
        ? 'QUEUED'
        : targets.some((t) => t.status === 'FAILED')
          ? 'FAILED'
          : 'SKIPPED'
    await tx.post.update({ where: { id: postId }, data: { status } })
  }
}
