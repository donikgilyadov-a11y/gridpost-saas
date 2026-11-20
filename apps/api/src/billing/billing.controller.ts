import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { z } from 'zod'
import { PLAN_LIMITS, type PlanId } from '@gridpost/shared'
import { CurrentOrg, CurrentUser, JwtAuthGuard, OrganizationGuard, ZodPipe, type AuthUser } from '../common/auth'
import { BillingService } from './billing.service'

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'business', 'agency']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
})

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  plans() {
    return Object.entries(PLAN_LIMITS).map(([id, limits]) => ({ id, ...limits }))
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard, OrganizationGuard)
  subscription(@CurrentOrg() organizationId: string) {
    return this.billing.current(organizationId)
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, OrganizationGuard)
  checkout(
    @CurrentOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(checkoutSchema)) body: { plan: PlanId; successUrl?: string; cancelUrl?: string }
  ) {
    return this.billing.checkout(
      organizationId,
      body.plan,
      user.email ?? '',
      body.successUrl ?? 'http://localhost:3000/settings?checkout=success',
      body.cancelUrl ?? 'http://localhost:3000/settings?checkout=cancel'
    )
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard, OrganizationGuard)
  portal(@CurrentOrg() organizationId: string) {
    return this.billing.portal(organizationId)
  }

  @Post('webhook')
  async webhook(@Req() request: Request) {
    const raw = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : JSON.stringify(request.body ?? {})
    const event = this.billing.verifyWebhook(raw, request.header('stripe-signature') ?? undefined)
    await this.billing.handleWebhook(event)
    return { received: true }
  }
}
