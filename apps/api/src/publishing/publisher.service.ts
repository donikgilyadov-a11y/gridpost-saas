import { Injectable, Logger } from '@nestjs/common'
import { Prisma, TargetStatus } from '@prisma/client'
import { UnrecoverableError } from 'bullmq'
import type { PublishJobPayload } from '@gridpost/shared'
import { PrismaService } from '../prisma/prisma.service'
import { SecretsService } from '../secrets/secrets.service'
import { publishTelegram } from './adapters/telegram'

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

      const metadata = account.metadata as Record<string, unknown>
      const token = this.secrets.decrypt(payload.organizationId, {
        cipher: account.tokenCipher,
        iv: account.tokenIv
      })
      const variants = post.variants as unknown as VariantMap
      const thread = variants[payload.lang] ?? Object.values(variants)[0] ?? []

      if (payload.platform !== 'telegram') {
        throw new UnrecoverableError(`Platform ${payload.platform} adapter lands in P2`)
      }
      if (!metadata.chatId || typeof metadata.chatId !== 'string') {
        throw new UnrecoverableError('Telegram chatId is missing')
      }

      const outcome = await publishTelegram({ token, chatId: metadata.chatId, thread })
      await this.finish(payload, 'PUBLISHED', outcome.remoteId, outcome.url)
      this.logger.log(`published ${payload.targetId} → ${outcome.remoteId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const permanent = error instanceof UnrecoverableError || /HTTP 4\d\d(?!\s*429)/.test(message)
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
