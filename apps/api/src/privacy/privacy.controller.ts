import { Controller, Delete, Get, UseGuards } from '@nestjs/common'
import { CurrentOrg, JwtAuthGuard, OrganizationGuard } from '../common/auth'
import { PrivacyService } from './privacy.service'

@Controller('privacy')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('export')
  export(@CurrentOrg() organizationId: string) {
    return this.privacy.export(organizationId)
  }

  @Delete('organization')
  remove(@CurrentOrg() organizationId: string) {
    return this.privacy.deleteOrganization(organizationId)
  }
}
