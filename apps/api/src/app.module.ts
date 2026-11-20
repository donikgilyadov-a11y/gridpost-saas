import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { OrganizationsModule } from './organizations/organizations.module'
import { QueueModule } from './queue/queue.module'
import { SecretsModule } from './secrets/secrets.module'
import { PublishingModule } from './publishing/publishing.module'
import { OAuthModule } from './oauth/oauth.module'
import { AiModule } from './ai/ai.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { HealthController } from './health/health.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    QueueModule,
    SecretsModule,
    PublishingModule,
    OAuthModule,
    AiModule,
    AnalyticsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
