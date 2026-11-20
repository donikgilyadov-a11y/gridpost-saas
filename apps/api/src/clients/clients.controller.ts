import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, JwtAuthGuard, OrganizationGuard, ZodPipe } from '../common/auth'
import { ClientsService, type ClientInput } from './clients.service'

const clientSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
})

const assignSchema = z.object({ clientId: z.string().uuid().nullable() })

@Controller('clients')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@CurrentOrg() organizationId: string) {
    return this.clients.list(organizationId)
  }

  @Post()
  create(@CurrentOrg() organizationId: string, @Body(new ZodPipe(clientSchema)) body: ClientInput) {
    return this.clients.create(organizationId, body)
  }

  @Patch(':id')
  update(@CurrentOrg() organizationId: string, @Param('id') id: string, @Body(new ZodPipe(clientSchema.partial())) body: Partial<ClientInput>) {
    return this.clients.update(organizationId, id, body)
  }

  @Delete(':id')
  remove(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.clients.remove(organizationId, id)
  }

  @Post('accounts/:accountId/assign')
  assign(
    @CurrentOrg() organizationId: string,
    @Param('accountId') accountId: string,
    @Body(new ZodPipe(assignSchema)) body: { clientId: string | null }
  ) {
    return this.clients.assignAccount(organizationId, accountId, body.clientId)
  }
}
