import { Injectable } from '@nestjs/common'
import { AutomationAction, AutomationTrigger } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AiService } from '../ai/ai.service'
import { PostsService } from '../publishing/posts.service'

export interface AutomationInput {
  name: string
  trigger: AutomationTrigger
  action: AutomationAction
  config?: Record<string, unknown>
  enabled?: boolean
}

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly posts: PostsService
  ) {}

  list(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.automationRule.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })
    )
  }

  create(organizationId: string, input: AutomationInput) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.automationRule.create({
        data: {
          organizationId,
          name: input.name,
          trigger: input.trigger,
          action: input.action,
          config: (input.config ?? {}) as object,
          enabled: input.enabled ?? true
        }
      })
    )
  }

  update(organizationId: string, id: string, patch: Partial<AutomationInput>) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.automationRule.update({
        where: { id },
        data: {
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.config ? { config: patch.config as object } : {})
        }
      })
    )
  }

  remove(organizationId: string, id: string) {
    return this.prisma.withOrg(organizationId, (tx) => tx.automationRule.delete({ where: { id } }))
  }

  /** Evaluates enabled rules. AI never publishes — it only creates drafts. */
  async run(organizationId: string): Promise<{ rule: string; createdDraft?: string; reason?: string }[]> {
    const rules = await this.prisma.withOrg(organizationId, (tx) =>
      tx.automationRule.findMany({ where: { organizationId, enabled: true } })
    )
    const results: { rule: string; createdDraft?: string; reason?: string }[] = []
    for (const rule of rules) {
      const config = rule.config as Record<string, unknown>
      const topic = typeof config.topic === 'string' ? config.topic : 'новости бренда'
      const shouldRun =
        rule.trigger === AutomationTrigger.SCHEDULE_GAP
          ? await this.hasGap(organizationId, Number(config.gapDays ?? 3))
          : rule.trigger === AutomationTrigger.LOW_ENGAGEMENT
            ? await this.hasLowEngagement(organizationId)
            : false
      if (!shouldRun) {
        results.push({ rule: rule.name, reason: 'условие не выполнено' })
        continue
      }
      const draft = await this.createDraft(organizationId, topic)
      results.push({ rule: rule.name, createdDraft: draft.id })
      await this.prisma.withOrg(organizationId, (tx) =>
        tx.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } })
      )
    }
    return results
  }

  private async hasGap(organizationId: string, gapDays: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - gapDays * 86_400_000)
    const count = await this.prisma.withOrg(organizationId, (tx) =>
      tx.post.count({ where: { organizationId, createdAt: { gte: cutoff } } })
    )
    return count === 0
  }

  private async hasLowEngagement(organizationId: string): Promise<boolean> {
    const [posts, metrics] = await Promise.all([
      this.prisma.withOrg(organizationId, (tx) => tx.post.count({ where: { organizationId, status: 'PUBLISHED' } })),
      this.prisma.withOrg(organizationId, (tx) => tx.metricSnapshot.count({ where: { organizationId } }))
    ])
    return posts > 0 && metrics < posts
  }

  private async createDraft(organizationId: string, topic: string) {
    const owner = await this.prisma.withOrg(organizationId, (tx) =>
      tx.membership.findFirst({ where: { organizationId, role: 'OWNER' } })
    )
    const accounts = await this.prisma.withOrg(organizationId, (tx) =>
      tx.socialAccount.findMany({ where: { organizationId, status: 'ACTIVE' }, take: 1 })
    )
    if (!owner || !accounts.length) throw new Error('Не найден владелец или активный аккаунт')
    const variants = await this.ai.content(topic, [accounts[0].platform], organizationId)
    return this.posts.createDraft({
      organizationId,
      authorId: owner.userId,
      key: randomUUID(),
      variants: { RU: [variants[0]?.text ?? topic] },
      targets: [{ accountId: accounts[0].id, lang: 'RU' }]
    })
  }
}
