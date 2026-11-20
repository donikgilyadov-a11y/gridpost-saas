import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { CurrentOrg, CurrentUser, JwtAuthGuard, OrganizationGuard, ZodPipe, type AuthUser } from '../common/auth'
import { AiService } from './ai.service'
import { BrandVoiceService, type BrandVoiceInput } from './brand-voice.service'
import { PostsService } from '../publishing/posts.service'

const voiceSchema = z.object({
  tone: z.string().min(1).max(300),
  audience: z.string().min(1).max(300),
  forbiddenWords: z.array(z.string()).max(50),
  phrases: z.array(z.string()).max(50),
  language: z.string().min(2).max(8),
  preferredLength: z.number().int().min(40).max(10000)
})

const contentSchema = z.object({
  topic: z.string().min(3).max(500),
  platforms: z.array(z.string()).min(1).max(10)
})

const planSchema = z.object({
  topic: z.string().min(3).max(500),
  weeks: z.number().int().min(1).max(8)
})

const draftSchema = z.object({
  variants: z.record(z.array(z.string().min(1))),
  targets: z.array(z.object({ accountId: z.string().uuid(), lang: z.string().min(2).max(8) })).min(1),
  mediaIds: z.array(z.string().uuid()).max(20).optional()
})

@Controller('ai')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly voice: BrandVoiceService,
    private readonly posts: PostsService
  ) {}

  @Get('brand-voice')
  voiceGet(@CurrentOrg() organizationId: string) {
    return this.voice.get(organizationId)
  }

  @Put('brand-voice')
  voiceSave(@CurrentOrg() organizationId: string, @Body(new ZodPipe(voiceSchema)) body: BrandVoiceInput) {
    return this.voice.save(organizationId, body)
  }

  @Post('content')
  content(
    @CurrentOrg() organizationId: string,
    @Body(new ZodPipe(contentSchema)) body: { topic: string; platforms: string[] }
  ) {
    return this.ai.content(body.topic, body.platforms, organizationId)
  }

  @Post('plan')
  plan(
    @CurrentOrg() organizationId: string,
    @Body(new ZodPipe(planSchema)) body: { topic: string; weeks: number }
  ) {
    return this.ai.plan(body.topic, body.weeks, organizationId)
  }

  @Post('drafts')
  draft(
    @CurrentOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(draftSchema))
    body: { variants: Record<string, string[]>; targets: { accountId: string; lang: string }[]; mediaIds?: string[] }
  ) {
    return this.posts.createDraft({
      organizationId,
      authorId: user.userId,
      key: randomUUID(),
      variants: body.variants,
      targets: body.targets,
      mediaIds: body.mediaIds
    })
  }
}
