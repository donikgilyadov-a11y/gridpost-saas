import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentOrg, CurrentUser, JwtAuthGuard, OrganizationGuard, ZodPipe, type AuthUser } from '../common/auth'
import { PostsService } from './posts.service'

const scheduleSchema = z.object({ scheduledAt: z.string().datetime() })

const createPostSchema = z.object({
  key: z.string().min(8).max(100),
  variants: z.record(z.array(z.string().min(1))),
  targets: z.array(z.object({ accountId: z.string().uuid(), lang: z.string().min(2).max(8) })).min(1),
  scheduledAt: z.string().datetime().optional(),
  mediaIds: z.array(z.string().uuid()).max(20).optional()
})

type CreatePostDto = z.infer<typeof createPostSchema>

@Controller('posts')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  create(@CurrentOrg() organizationId: string, @CurrentUser() user: AuthUser, @Body(new ZodPipe(createPostSchema)) dto: CreatePostDto) {
    return this.posts.create({
      organizationId,
      authorId: user.userId,
      key: dto.key,
      variants: dto.variants,
      targets: dto.targets,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      mediaIds: dto.mediaIds
    })
  }

  @Get()
  list(@CurrentOrg() organizationId: string) {
    return this.posts.list(organizationId)
  }

  @Get(':id')
  get(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.posts.get(organizationId, id)
  }

  @Patch(':id/schedule')
  reschedule(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(scheduleSchema)) body: { scheduledAt: string }
  ) {
    return this.posts.reschedule(organizationId, id, body.scheduledAt)
  }

  @Post(':id/retry')
  retry(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.posts.retryFailed(organizationId, id)
  }

  @Post(':id/publish')
  publish(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.posts.publishDraft(organizationId, id)
  }
}
