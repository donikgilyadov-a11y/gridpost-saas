import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { Worker } from 'bullmq'
import type { PublishJobPayload } from '@gridpost/shared'

export const PUBLISH_WORKER = 'PUBLISH_WORKER'

@Injectable()
export class PublisherWorker implements OnModuleDestroy {
  constructor(@Inject(PUBLISH_WORKER) private readonly worker: Worker<PublishJobPayload>) {}

  async onModuleDestroy(): Promise<void> {
    await this.worker.close()
  }
}
