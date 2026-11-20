import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, CurrentUser, JwtAuthGuard, OrganizationGuard, ZodPipe, type AuthUser } from '../common/auth'
import { OrganizationsService } from './organizations.service'
import { SecretsService } from '../secrets/secrets.service'

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER')
})

const roleSchema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'MEMBER']) })

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/)
})

@Controller('organizations')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly secrets: SecretsService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.organizations.listForUser(user.userId)
  }

  @Get('current')
  current(@CurrentOrg() organizationId: string) {
    return this.organizations.current(organizationId)
  }

  @Get('current/members')
  members(@CurrentOrg() organizationId: string) {
    return this.organizations.members(organizationId)
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createOrganizationSchema)) dto: { name: string; slug: string }) {
    const organization = await this.organizations.createForUser(user.userId, dto.name, dto.slug)
    await this.organizations.audit(user, 'organization.create', organization.id, { name: dto.name })
    return organization
  }

  @Post('current/members')
  invite(@CurrentOrg() organizationId: string, @Body(new ZodPipe(inviteSchema)) body: { email: string; role: 'ADMIN' | 'MEMBER' }) {
    return this.organizations.invite(organizationId, body.email, body.role)
  }

  @Post('current/members/:id/role')
  updateRole(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(roleSchema)) body: { role: 'OWNER' | 'ADMIN' | 'MEMBER' }
  ) {
    return this.organizations.updateRole(organizationId, id, body.role)
  }

  @Delete('current/members/:id')
  removeMember(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.organizations.removeMember(organizationId, id)
  }

  @Post('current/rotate-keys')
  async rotateKeys(@CurrentUser() user: AuthUser, @CurrentOrg() organizationId: string) {
    const rotated = await this.secrets.rotate(organizationId)
    await this.organizations.audit(user, 'organization.rotateKeys', organizationId, { tokens: rotated })
    return { rotated }
  }
}
