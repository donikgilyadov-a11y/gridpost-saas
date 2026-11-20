import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, JwtAuthGuard, OrganizationGuard, ZodPipe } from '../common/auth'
import { SocialAccountsService } from './social-accounts.service'

const connectSchema = z.object({
  platform: z.string().min(2).max(30),
  externalId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  token: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  scopes: z.array(z.string()).optional()
})

type ConnectDto = z.infer<typeof connectSchema>

@Controller('social-accounts')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class SocialAccountsController {
  constructor(private readonly accounts: SocialAccountsService) {}

  @Get()
  list(@CurrentOrg() organizationId: string) {
    return this.accounts.list(organizationId)
  }

  @Post('connect')
  connect(@CurrentOrg() organizationId: string, @Body(new ZodPipe(connectSchema)) dto: ConnectDto) {
    return this.accounts.connect({ organizationId, ...dto })
  }

  @Delete(':id')
  disconnect(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.accounts.disconnect(organizationId, id)
  }
}
