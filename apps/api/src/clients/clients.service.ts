import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface ClientInput {
  name: string
  description?: string
  color?: string
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.client.findMany({
        where: { organizationId },
        include: { _count: { select: { socialAccounts: true } } },
        orderBy: { createdAt: 'desc' }
      })
    )
  }

  create(organizationId: string, input: ClientInput) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.client.create({ data: { organizationId, ...input } })
    )
  }

  update(organizationId: string, id: string, input: Partial<ClientInput>) {
    return this.prisma.withOrg(organizationId, (tx) => tx.client.update({ where: { id }, data: input }))
  }

  remove(organizationId: string, id: string) {
    return this.prisma.withOrg(organizationId, (tx) => tx.client.delete({ where: { id } }))
  }

  assignAccount(organizationId: string, accountId: string, clientId: string | null) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.socialAccount.update({ where: { id: accountId }, data: { clientId } })
    )
  }
}
