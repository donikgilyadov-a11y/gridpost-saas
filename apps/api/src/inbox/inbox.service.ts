import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SecretsService } from '../secrets/secrets.service'
import { fetchFacebookComments } from '../publishing/adapters/facebook'
import { fetchInstagramComments } from '../publishing/adapters/instagram'

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService
  ) {}

  list(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.inboxMessage.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 200
      })
    )
  }

  markRead(organizationId: string, id: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.inboxMessage.update({ where: { id }, data: { isRead: true } })
    )
  }

  async sync(organizationId: string): Promise<{ imported: number; errors: string[] }> {
    const targets = await this.prisma.withOrg(organizationId, (tx) =>
      tx.postTarget.findMany({
        where: { organizationId, status: 'PUBLISHED', remoteId: { not: null } },
        include: { socialAccount: true },
        take: 30
      })
    )
    let imported = 0
    const errors: string[] = []
    for (const target of targets) {
      const account = target.socialAccount
      if (!account || !['facebook', 'instagram'].includes(account.platform) || !target.remoteId) continue
      try {
        const token = await this.secrets.decrypt(organizationId, {
          cipher: account.tokenCipher,
          iv: account.tokenIv,
          keyVersion: account.keyVersion
        })
        const comments =
          account.platform === 'facebook'
            ? await fetchFacebookComments(token, target.remoteId)
            : await fetchInstagramComments(token, target.remoteId)
        for (const comment of comments) {
          await this.prisma.withOrg(organizationId, (tx) =>
            tx.inboxMessage.upsert({
              where: {
                organizationId_platform_externalId: {
                  organizationId,
                  platform: account.platform,
                  externalId: comment.id
                }
              },
              create: {
                organizationId,
                platform: account.platform,
                externalId: comment.id,
                author: comment.author,
                text: comment.text,
                url: target.url ?? undefined
              },
              update: { author: comment.author, text: comment.text }
            })
          )
          imported += 1
        }
      } catch (error) {
        const message = `${account.platform}/${target.id}: ${(error as Error).message}`
        errors.push(message)
        this.logger.warn(message)
      }
    }
    return { imported, errors }
  }
}
