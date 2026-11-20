import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /** GDPR data portability: all organization data without raw secrets. */
  export(organizationId: string) {
    return this.prisma.withOrg(organizationId, async (tx) => {
      const [
        organization,
        members,
        accounts,
        posts,
        metrics,
        audit,
        subscription,
        brandVoice
      ] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        tx.membership.findMany({
          where: { organizationId },
          select: { role: true, createdAt: true, user: { select: { email: true, displayName: true } } }
        }),
        tx.socialAccount.findMany({
          where: { organizationId },
          select: { platform: true, externalId: true, displayName: true, status: true, scopes: true, expiresAt: true, metadata: true }
        }),
        tx.post.findMany({ where: { organizationId }, include: { targets: true } }),
        tx.metricSnapshot.findMany({ where: { organizationId } }),
        tx.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 1000 }),
        tx.subscription.findUnique({ where: { organizationId } }),
        tx.brandVoice.findUnique({ where: { organizationId } })
      ])
      return {
        exportedAt: new Date().toISOString(),
        organization: { id: organization.id, name: organization.name, slug: organization.slug, timezone: organization.timezone },
        members,
        accounts,
        posts,
        metrics,
        audit,
        subscription: subscription ? { plan: subscription.plan, status: subscription.status } : null,
        brandVoice
      }
    })
  }

  /** Right to erasure: cascading delete of the organization and all of its data. */
  async deleteOrganization(organizationId: string): Promise<{ deleted: true }> {
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.organization.delete({ where: { id: organizationId } })
    )
    return { deleted: true }
  }
}
