import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentOrg, JwtAuthGuard, OrganizationGuard } from '../common/auth'
import { InboxService } from './inbox.service'

@Controller('inbox')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentOrg() organizationId: string) {
    return this.inbox.list(organizationId)
  }

  @Post('sync')
  sync(@CurrentOrg() organizationId: string) {
    return this.inbox.sync(organizationId)
  }

  @Post(':id/read')
  read(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.inbox.markRead(organizationId, id)
  }
}
