import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, JwtAuthGuard, OrganizationGuard, ZodPipe } from '../common/auth'
import { MediaService } from './media.service'

const presignSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(80),
  size: z.number().int().positive(),
  alt: z.string().max(1000).optional()
})

@Controller('media')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  presign(@CurrentOrg() organizationId: string, @Body(new ZodPipe(presignSchema)) body: z.infer<typeof presignSchema>) {
    return this.media.presign(organizationId, body)
  }

  @Post(':id/confirm')
  confirm(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.media.confirm(organizationId, id)
  }

  @Get()
  list(@CurrentOrg() organizationId: string) {
    return this.media.list(organizationId)
  }

  @Delete(':id')
  remove(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.media.remove(organizationId, id)
  }
}
