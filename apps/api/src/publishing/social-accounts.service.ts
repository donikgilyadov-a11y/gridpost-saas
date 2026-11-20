import { ConflictException, Injectable } from '@nestjs/common'
import { PLATFORM_PRIORITY } from '@gridpost/shared'
import { PrismaService } from '../prisma/prisma.service'
import { SecretsService } from '../secrets/secrets.service'

export interface ConnectAccountInput {
  organizationId: string
  platform: string
  externalId: string
  displayName: string
  token: string
  metadata?: Record<string, unknown>
  scopes?: string[]
  expiresAt?: Date
}

@Injectable()
export class SocialAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService
  ) {}

  list(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.socialAccount.findMany({
        where: { organizationId },
        select: {
          id: true,
          platform: true,
          externalId: true,
          displayName: true,
          status: true,
          scopes: true,
          metadata: true,
          expiresAt: true,
          createdAt: true
        }
      })
    )
  }

  async connect(input: ConnectAccountInput) {
    if (!(input.platform in PLATFORM_PRIORITY)) {
      throw new ConflictException(`Unknown platform: ${input.platform}`)
    }
    const sealed = await this.secrets.encrypt(input.organizationId, input.token)
    return this.prisma.withOrg(input.organizationId, (tx) =>
      tx.socialAccount.upsert({
        where: {
          organizationId_platform_externalId: {
            organizationId: input.organizationId,
            platform: input.platform,
            externalId: input.externalId
          }
        },
        create: {
          organizationId: input.organizationId,
          platform: input.platform,
          externalId: input.externalId,
          displayName: input.displayName,
          tokenCipher: sealed.cipher,
          tokenIv: sealed.iv,
          keyVersion: sealed.keyVersion,
          metadata: (input.metadata ?? {}) as object,
          scopes: input.scopes ?? [],
          expiresAt: input.expiresAt,
          status: 'ACTIVE'
        },
        update: {
          displayName: input.displayName,
          tokenCipher: sealed.cipher,
          tokenIv: sealed.iv,
          keyVersion: sealed.keyVersion,
          metadata: (input.metadata ?? {}) as object,
          scopes: input.scopes ?? [],
          expiresAt: input.expiresAt,
          status: 'ACTIVE'
        },
        select: {
          id: true,
          platform: true,
          externalId: true,
          displayName: true,
          status: true,
          createdAt: true
        }
      })
    )
  }

  disconnect(organizationId: string, accountId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.socialAccount.update({
        where: { id: accountId },
        data: { status: 'DISCONNECTED' }
      })
    )
  }
}
