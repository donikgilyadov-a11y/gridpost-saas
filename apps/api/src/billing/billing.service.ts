import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { PLAN_LIMITS, type PlanId } from '@gridpost/shared'
import type { BillingPlan as DbPlanId } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const toDbPlan = (plan: PlanId): DbPlanId => plan.toUpperCase() as DbPlanId
const fromDbPlan = (plan: DbPlanId): PlanId => plan.toLowerCase() as PlanId

const PRICE_ENV: Partial<Record<PlanId, string>> = {
  starter: 'STRIPE_PRICE_STARTER',
  pro: 'STRIPE_PRICE_PRO',
  business: 'STRIPE_PRICE_BUSINESS',
  agency: 'STRIPE_PRICE_AGENCY'
}

interface StripeObject {
  id: string
  object: string
  customer?: string
  subscription?: string
  status?: string
  metadata?: Record<string, string>
  url?: string
  current_period_end?: number
  cancel_at_period_end?: boolean
  items?: { data?: Array<{ price?: { id?: string } }> }
  lines?: { data?: Array<{ price?: { id?: string } }> }
  client_reference_id?: string
}

interface StripeEvent {
  id: string
  type: string
  data: { object: StripeObject }
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  private get base(): string {
    return this.config.get<string>('STRIPE_API_BASE') ?? 'https://api.stripe.com'
  }

  private get key(): string {
    return this.config.getOrThrow<string>('STRIPE_SECRET_KEY')
  }

  private async stripe(method: 'GET' | 'POST', path: string, params: Record<string, string | number | undefined> = {}): Promise<StripeObject> {
    const form = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) form.set(key, String(value))
    }
    const url = method === 'GET' ? `${this.base}${path}?${form.toString()}` : `${this.base}${path}`
    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${this.key}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(method === 'POST' ? { body: form } : {})
    })
    const data = (await response.json().catch(() => ({}))) as StripeObject & { error?: { message: string } }
    if (!response.ok) throw new Error(data.error?.message ?? `Stripe HTTP ${response.status}`)
    return data
  }

  async current(organizationId: string) {
    const record = await this.prisma.withOrg(organizationId, (tx) =>
      tx.subscription.findUnique({ where: { organizationId } })
    )
    const plan = this.effectivePlan(record)
    return {
      plan,
      status: record?.status ?? 'active',
      limits: PLAN_LIMITS[plan],
      currentPeriodEnd: record?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: record?.cancelAtPeriodEnd ?? false,
      stripeCustomerId: record?.stripeCustomerId ?? null
    }
  }

  private effectivePlan(record: { plan: DbPlanId; status: string; currentPeriodEnd: Date | null } | null): PlanId {
    if (!record) return 'free'
    const active = ['active', 'trialing'].includes(record.status)
    const valid = !record.currentPeriodEnd || record.currentPeriodEnd.getTime() > Date.now()
    return active && valid ? fromDbPlan(record.plan) : 'free'
  }

  async effectivePlanFor(organizationId: string): Promise<PlanId> {
    const record = await this.prisma.withOrg(organizationId, (tx) =>
      tx.subscription.findUnique({ where: { organizationId } })
    )
    return this.effectivePlan(record)
  }

  async limitsFor(organizationId: string) {
    return PLAN_LIMITS[await this.effectivePlanFor(organizationId)]
  }

  private async ensureCustomer(organizationId: string, email: string): Promise<string> {
    const record = await this.prisma.withOrg(organizationId, (tx) =>
      tx.subscription.findUnique({ where: { organizationId } })
    )
    if (record?.stripeCustomerId) return record.stripeCustomerId
    const customer = await this.stripe('POST', '/v1/customers', {
      email,
      'metadata[organization_id]': organizationId
    })
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.subscription.upsert({
        where: { organizationId },
        create: { organizationId, stripeCustomerId: customer.id, plan: 'FREE' },
        update: { stripeCustomerId: customer.id }
      })
    )
    return customer.id
  }

  async checkout(organizationId: string, plan: PlanId, email: string, successUrl: string, cancelUrl: string) {
    if (plan === 'free' || plan === 'enterprise') throw new BadRequestException('Этот тариф не покупается через checkout')
    const priceId = this.config.get<string>(PRICE_ENV[plan] ?? '')
    if (!priceId) throw new BadRequestException(`Не задан ценовой идентификатор для тарифа ${plan}`)
    const customer = await this.ensureCustomer(organizationId, email)
    const session = await this.stripe('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      customer,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organizationId,
      'subscription_data[metadata][organization_id]': organizationId,
      'subscription_data[metadata][plan]': plan
    })
    return { url: session.url }
  }

  async portal(organizationId: string) {
    const record = await this.prisma.withOrg(organizationId, (tx) =>
      tx.subscription.findUnique({ where: { organizationId } })
    )
    if (!record?.stripeCustomerId) throw new BadRequestException('У организации нет Stripe-клиента')
    const session = await this.stripe('POST', '/v1/billing_portal/sessions', {
      customer: record.stripeCustomerId,
      return_url: this.config.get<string>('BILLING_RETURN_URL') ?? 'http://localhost:3000/settings'
    })
    return { url: session.url }
  }

  verifyWebhook(raw: string, header: string | undefined): StripeEvent {
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET')
    if (!header) throw new BadRequestException('Missing Stripe-Signature')
    const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')))
    const timestamp = parts.t
    const signature = parts.v1
    if (!timestamp || !signature) throw new BadRequestException('Malformed Stripe-Signature')
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new BadRequestException('Stale webhook')
    const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new BadRequestException('Invalid webhook signature')
    }
    return JSON.parse(raw) as StripeEvent
  }

  async handleWebhook(event: StripeEvent): Promise<void> {
    const object = event.data.object
    const organizationId = object.metadata?.organization_id ?? object.client_reference_id
    if (!organizationId) {
      this.logger.warn(`webhook ${event.type} has no organization id`)
      return
    }

    if (event.type === 'checkout.session.completed') {
      const subscriptionId = typeof object.subscription === 'string' ? object.subscription : undefined
      await this.prisma.withOrg(organizationId, (tx) =>
        tx.subscription.upsert({
          where: { organizationId },
          create: {
            organizationId,
            stripeCustomerId: typeof object.customer === 'string' ? object.customer : undefined,
            stripeSubscriptionId: subscriptionId,
            plan: toDbPlan((object.metadata?.plan as PlanId) ?? 'free'),
            status: 'active'
          },
          update: {
            stripeSubscriptionId: subscriptionId,
            plan: toDbPlan((object.metadata?.plan as PlanId) ?? 'free'),
            status: 'active'
          }
        })
      )
      return
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const priceId = object.items?.data?.[0]?.price?.id ?? object.lines?.data?.[0]?.price?.id
      let plan = object.metadata?.plan as PlanId | undefined
      if (!plan && priceId) {
        for (const [candidate, envKey] of Object.entries(PRICE_ENV)) {
          if (this.config.get<string>(envKey ?? '') === priceId) plan = candidate as PlanId
        }
      }
      await this.prisma.withOrg(organizationId, (tx) =>
        tx.subscription.update({
          where: { organizationId },
          data: {
            status: event.type === 'customer.subscription.deleted' ? 'canceled' : (object.status ?? 'active'),
            plan: toDbPlan(plan ?? 'free'),
            currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000) : null,
            cancelAtPeriodEnd: Boolean(object.cancel_at_period_end)
          }
        })
      )
    }
  }
}
