import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PostsService } from './posts.service'

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), 15_000)
    this.timer.unref()
    void this.tick()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    try {
      const organizations = await this.prisma.withSystem((tx) =>
        tx.organization.findMany({ select: { id: true } })
      )
      for (const organization of organizations) {
        const due = await this.prisma.withOrg(organization.id, (tx) =>
          tx.post.findMany({
            where: {
              organizationId: organization.id,
              status: 'SCHEDULED',
              scheduledAt: { lte: new Date() }
            },
            select: { id: true }
          })
        )
        for (const post of due) {
          await this.posts.enqueuePost(organization.id, post.id)
          this.logger.log(`scheduled post ${post.id} queued for org ${organization.id}`)
        }
        const recovered = await this.posts.recoverStuck(organization.id)
        if (recovered) this.logger.warn(`recovered ${recovered} stuck targets in ${organization.id}`)
      }
    } catch (error) {
      this.logger.error(`scheduler tick failed: ${(error as Error).message}`)
    }
  }
}
