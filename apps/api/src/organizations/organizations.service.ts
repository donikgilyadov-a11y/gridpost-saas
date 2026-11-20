import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthUser } from '../common/auth'

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' }
    })
  }

  current(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.organization.findUniqueOrThrow({ where: { id: organizationId } })
    )
  }

  async createForUser(userId: string, name: string, slug: string) {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name, slug } })
      await tx.membership.create({
        data: { organizationId: organization.id, userId, role: 'OWNER' }
      })
      return organization
    })
  }

  members(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.membership.findMany({
        where: { organizationId },
        include: { user: { select: { id: true, email: true, displayName: true } } }
      })
    )
  }

  audit(user: AuthUser, action: string, resource: string, metadata: Record<string, unknown> = {}) {
    return this.prisma.withOrg(user.organizationId, (tx) =>
      tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.userId,
          action,
          resource,
          metadata: metadata as object
        }
      })
    )
  }
}
