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

  async invite(organizationId: string, email: string, role: 'ADMIN' | 'MEMBER') {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user) throw new Error('Пользователь с таким email не зарегистрирован')
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.membership.upsert({
        where: { organizationId_userId: { organizationId, userId: user.id } },
        create: { organizationId, userId: user.id, role },
        update: { role }
      })
    )
  }

  updateRole(organizationId: string, membershipId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.membership.update({ where: { id: membershipId }, data: { role } })
    )
  }

  removeMember(organizationId: string, membershipId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.membership.delete({ where: { id: membershipId } })
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
