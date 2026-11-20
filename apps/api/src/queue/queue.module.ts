import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { PUBLISH_QUEUE, QueueService } from './queue.service'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PUBLISH_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connection = new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null
        })
        return new Queue('gridpost-publish', { connection })
      }
    },
    QueueService
  ],
  exports: [QueueService]
})
export class QueueModule {}
