import { Inject, Injectable, OnModuleDestroy, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import type { PublishJobPayload } from '@gridpost/shared'

export const PUBLISH_QUEUE = 'PUBLISH_QUEUE'

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name)

  constructor(@Inject(PUBLISH_QUEUE) private readonly queue: Queue<PublishJobPayload>) {}

  /** jobId = idempotency key: repeated enqueue never creates a second publish. */
  async enqueue(payload: PublishJobPayload, delayMs = 0): Promise<string> {
    const job = await this.queue.add('publish', payload, {
      jobId: payload.idempotencyKey,
      delay: delayMs,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000
    })
    this.logger.log(`queued ${job.id} for org ${payload.organizationId}`)
    return job.id ?? payload.idempotencyKey
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
  }
}
