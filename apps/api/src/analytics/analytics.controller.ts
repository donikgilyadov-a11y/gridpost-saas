import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, JwtAuthGuard, OrganizationGuard, ZodPipe } from '../common/auth'
import { AnalyticsService } from './analytics.service'

const syncSchema = z.object({ postId: z.string().uuid().optional() })

@Controller('analytics')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@CurrentOrg() organizationId: string) {
    return this.analytics.summary(organizationId)
  }

  @Post('sync')
  sync(@CurrentOrg() organizationId: string, @Body(new ZodPipe(syncSchema)) body: { postId?: string }) {
    return this.analytics.sync(organizationId, body.postId)
  }

  @Get('recommendations')
  recommendations(@CurrentOrg() organizationId: string) {
    return this.analytics.recommendations(organizationId)
  }
}
