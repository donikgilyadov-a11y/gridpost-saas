import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, JwtAuthGuard, OrganizationGuard, ZodPipe } from '../common/auth'
import { AutomationsService, type AutomationInput } from './automations.service'

const ruleSchema = z.object({
  name: z.string().min(1).max(100),
  trigger: z.enum(['SCHEDULE_GAP', 'LOW_ENGAGEMENT', 'NEW_POST']),
  action: z.enum(['CREATE_DRAFT', 'NOTIFY']),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional()
})

@Controller('automations')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list(@CurrentOrg() organizationId: string) {
    return this.automations.list(organizationId)
  }

  @Post()
  create(@CurrentOrg() organizationId: string, @Body(new ZodPipe(ruleSchema)) body: AutomationInput) {
    return this.automations.create(organizationId, body)
  }

  @Patch(':id')
  update(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(ruleSchema.partial())) body: Partial<AutomationInput>
  ) {
    return this.automations.update(organizationId, id, body)
  }

  @Delete(':id')
  remove(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.automations.remove(organizationId, id)
  }

  @Post('run')
  run(@CurrentOrg() organizationId: string) {
    return this.automations.run(organizationId)
  }
}
