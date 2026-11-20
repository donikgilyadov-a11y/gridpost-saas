import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { makeIdempotencyKey, type PublishJobPayload } from '@gridpost/shared'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../queue/queue.service'
import { BillingService } from '../billing/billing.service'

export interface CreatePostInput {
  organizationId: string
  authorId: string
  key: string
  variants: Record<string, string[]>
  targets: { accountId: string; lang: string }[]
  scheduledAt?: Date
  mediaIds?: string[]
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly billing: BillingService
  ) {}

  private async resolveMedia(organizationId: string, ids: string[] = []) {
    if (!ids.length) return []
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.mediaAsset.findMany({ where: { organizationId, id: { in: ids } } })
    )
  }

  async create(input: CreatePostInput) {
    const limits = await this.billing.limitsFor(input.organizationId)
    const media = await this.resolveMedia(input.organizationId, input.mediaIds)
    const accountCount = await this.prisma.withOrg(input.organizationId, (tx) =>
      tx.socialAccount.count({ where: { organizationId: input.organizationId } })
    )
    if (accountCount > limits.accounts) {
      throw new ForbiddenException(`Тариф ограничивает количество аккаунтов (${limits.accounts})`)
    }

    const window = input.scheduledAt?.toISOString().slice(0, 16) ?? 'now'
    const idempotencyKey = makeIdempotencyKey(input.organizationId, input.key, 'post', window)

    const post = await this.prisma.withOrg(input.organizationId, async (tx) => {
      const existing = await tx.post.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey } },
        include: { targets: true }
      })
      if (existing) return existing

      return tx.post.create({
        data: {
          organizationId: input.organizationId,
          authorId: input.authorId,
          variants: input.variants as unknown as Prisma.InputJsonValue,
          media: media as unknown as Prisma.InputJsonValue,
          idempotencyKey,
          scheduledAt: input.scheduledAt,
          status: input.scheduledAt ? 'SCHEDULED' : 'QUEUED',
          targets: {
            create: input.targets.map((target) => ({
              organizationId: input.organizationId,
              accountId: target.accountId,
              lang: target.lang,
              status: input.scheduledAt ? 'PENDING' : 'QUEUED'
            }))
          }
        },
        include: { targets: true }
      })
    })

    if (!input.scheduledAt) {
      const accounts = await this.prisma.withOrg(input.organizationId, (tx) =>
        tx.socialAccount.findMany({ where: { id: { in: input.targets.map((t) => t.accountId) } } })
      )
      const platforms = new Map(accounts.map((account) => [account.id, account.platform]))
      for (const target of post.targets) {
        await this.enqueue(input.organizationId, post.id, target.id, target.accountId, target.lang, platforms.get(target.accountId) ?? 'telegram')
      }
    }

    return post
  }

  /** AI output lands here: nothing is published without an explicit user action. */
  async createDraft(input: CreatePostInput) {
    const media = await this.resolveMedia(input.organizationId, input.mediaIds)
    const window = input.scheduledAt?.toISOString().slice(0, 16) ?? 'draft'
    const idempotencyKey = makeIdempotencyKey(input.organizationId, input.key, 'draft', window)
    return this.prisma.withOrg(input.organizationId, async (tx) => {
      const existing = await tx.post.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey } },
        include: { targets: true }
      })
      if (existing) return existing
      return tx.post.create({
        data: {
          organizationId: input.organizationId,
          authorId: input.authorId,
          variants: input.variants as unknown as Prisma.InputJsonValue,
          media: media as unknown as Prisma.InputJsonValue,
          idempotencyKey,
          scheduledAt: input.scheduledAt,
          status: 'DRAFT',
          targets: {
            create: input.targets.map((target) => ({
              organizationId: input.organizationId,
              accountId: target.accountId,
              lang: target.lang,
              status: 'PENDING'
            }))
          }
        },
        include: { targets: true }
      })
    })
  }

  async publishDraft(organizationId: string, postId: string) {
    const post = await this.get(organizationId, postId)
    if (post.status !== 'DRAFT') throw new Error('Только черновик можно отправить вручную')
    await this.enqueuePost(organizationId, postId)
    return this.get(organizationId, postId)
  }

  private async enqueue(
    organizationId: string,
    postId: string,
    targetId: string,
    accountId: string,
    lang: string,
    platform: string,
    delayMs = 0
  ): Promise<void> {
    const payload: PublishJobPayload = {
      organizationId,
      postId,
      targetId,
      accountId,
      platform: platform as PublishJobPayload['platform'],
      lang,
      idempotencyKey: makeIdempotencyKey(organizationId, postId, targetId, 'publish')
    }
    await this.queue.enqueue(payload, delayMs)
  }

  async enqueuePost(organizationId: string, postId: string): Promise<void> {
    const post = await this.prisma.withOrg(organizationId, (tx) =>
      tx.post.findUniqueOrThrow({ where: { id: postId }, include: { targets: true } })
    )
    const accounts = await this.prisma.withOrg(organizationId, (tx) =>
      tx.socialAccount.findMany({ where: { id: { in: post.targets.map((t) => t.accountId) } } })
    )
    const platforms = new Map(accounts.map((account) => [account.id, account.platform]))
    for (const target of post.targets) {
      if (target.status === 'PUBLISHED') continue
      await this.enqueue(organizationId, postId, target.id, target.accountId, target.lang, platforms.get(target.accountId) ?? 'telegram')
    }
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.post.update({ where: { id: postId }, data: { status: 'QUEUED' } })
    )
  }

  list(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.post.findMany({
        where: { organizationId },
        include: { targets: true },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    )
  }

  async get(organizationId: string, postId: string) {
    const post = await this.prisma.withOrg(organizationId, (tx) =>
      tx.post.findUnique({ where: { id: postId }, include: { targets: true } })
    )
    if (!post) throw new NotFoundException('Post not found')
    return post
  }

  async reschedule(organizationId: string, postId: string, scheduledAt: string) {
    const post = await this.get(organizationId, postId)
    if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') {
      throw new Error('Опубликованный или отправляемый пост нельзя перенести')
    }
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.post.update({
        where: { id: postId },
        data: { scheduledAt: new Date(scheduledAt), status: 'SCHEDULED' }
      })
    )
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.postTarget.updateMany({
        where: { organizationId, postId, status: { in: ['PENDING', 'QUEUED'] } },
        data: { status: 'PENDING' }
      })
    )
    return this.get(organizationId, postId)
  }

  async retryFailed(organizationId: string, postId: string) {
    await this.prisma.withOrg(organizationId, async (tx) => {
      await tx.postTarget.updateMany({
        where: { organizationId, postId, status: 'FAILED' },
        data: { status: 'QUEUED', error: null }
      })
    })
    await this.enqueuePost(organizationId, postId)
    return this.get(organizationId, postId)
  }

  /** Targets stuck in PUBLISHING after a crash — returned to the queue. */
  async recoverStuck(organizationId: string): Promise<number> {
    const threshold = new Date(Date.now() - 5 * 60_000)
    const stuck = await this.prisma.withOrg(organizationId, (tx) =>
      tx.postTarget.findMany({
        where: { organizationId, status: 'PUBLISHING', updatedAt: { lt: threshold } },
        select: { id: true, postId: true, accountId: true, lang: true }
      })
    )
    for (const target of stuck) {
      const account = await this.prisma.withOrg(organizationId, (tx) =>
        tx.socialAccount.findUniqueOrThrow({ where: { id: target.accountId } })
      )
      await this.enqueue(organizationId, target.postId, target.id, target.accountId, target.lang, account.platform)
    }
    return stuck.length
  }
}
