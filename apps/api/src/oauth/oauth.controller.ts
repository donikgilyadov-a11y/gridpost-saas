import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, CurrentUser, JwtAuthGuard, OrganizationGuard, ZodPipe, type AuthUser } from '../common/auth'
import { OAuthService } from './oauth.service'

const callbackSchema = z.object({ code: z.string().min(1), state: z.string().min(1) })

@Controller('oauth')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get(':platform/url')
  url(@CurrentOrg() organizationId: string, @CurrentUser() user: AuthUser, @Param('platform') platform: string) {
    return this.oauth.authorizationUrl(organizationId, user.userId, platform)
  }

  @Post(':platform/callback')
  callback(
    @Param('platform') platform: string,
    @Body(new ZodPipe(callbackSchema)) body: { code: string; state: string }
  ) {
    return this.oauth.callback(platform, body.code, body.state)
  }
}
