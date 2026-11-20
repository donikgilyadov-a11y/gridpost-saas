import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Worker } from 'bullmq'
import Redis from 'ioredis'
import type { PublishJobPayload } from '@gridpost/shared'
import { PostsController } from './posts.controller'
import { SocialAccountsController } from './social-accounts.controller'
import { PostsService } from './posts.service'
import { SocialAccountsService } from './social-accounts.service'
import { PublisherService } from './publisher.service'
import { SchedulerService } from './scheduler.service'
import { PUBLISH_WORKER, PublisherWorker } from './publisher.worker'

@Module({
  imports: [ConfigModule],
  controllers: [PostsController, SocialAccountsController],
  providers: [
    PostsService,
    SocialAccountsService,
    PublisherService,
    SchedulerService,
    PublisherWorker,
    {
      provide: PUBLISH_WORKER,
      inject: [ConfigService, PublisherService],
      useFactory: (config: ConfigService, publisher: PublisherService) =>
        new Worker<PublishJobPayload>(
          'gridpost-publish',
          async (job) => publisher.process(job.data),
          {
            connection: new Redis(config.getOrThrow<string>('REDIS_URL'), {
              maxRetriesPerRequest: null
            }),
            concurrency: 5
          }
        )
    }
  ],
  exports: [PostsService]
})
export class PublishingModule {}
