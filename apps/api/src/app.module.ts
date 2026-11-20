import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { OrganizationsModule } from './organizations/organizations.module'
import { QueueModule } from './queue/queue.module'
import { SecretsModule } from './secrets/secrets.module'
import { PublishingModule } from './publishing/publishing.module'
import { OAuthModule } from './oauth/oauth.module'
import { AiModule } from './ai/ai.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { BillingModule } from './billing/billing.module'
import { PrivacyModule } from './privacy/privacy.module'
import { MediaModule } from './media/media.module'
import { HealthController } from './health/health.controller'
import { AuditInterceptor } from './audit/audit.interceptor'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    QueueModule,
    SecretsModule,
    PublishingModule,
    OAuthModule,
    AiModule,
    AnalyticsModule,
    BillingModule,
    PrivacyModule,
    MediaModule
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  ]
})
export class AppModule {}
