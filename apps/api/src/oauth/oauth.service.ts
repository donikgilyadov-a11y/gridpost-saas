import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { SocialAccountsService } from '../publishing/social-accounts.service'
import { OAUTH_PROVIDERS } from './oauth.providers'

interface TokenResponse {
  access_token: string
  expires_in?: number
  scopes?: string
  error?: { message: string }
}

function base64url(value: Buffer): string {
  return value.toString('base64url')
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly accounts: SocialAccountsService
  ) {}

  async authorizationUrl(organizationId: string, userId: string, platform: string): Promise<string> {
    const provider = OAUTH_PROVIDERS[platform]
    if (!provider) throw new BadRequestException(`OAuth is not configured for ${platform}`)
    const state = randomBytes(24).toString('hex')
    const codeVerifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(codeVerifier).digest())
    const redirectUri = this.config.getOrThrow<string>('OAUTH_REDIRECT_URI')

    await this.prisma.withOrg(organizationId, (tx) =>
      tx.oAuthState.create({
        data: {
          organizationId,
          userId,
          platform,
          state,
          codeVerifier,
          redirectUri,
          expiresAt: new Date(Date.now() + 10 * 60_000)
        }
      })
    )

    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('FACEBOOK_APP_ID'),
      redirect_uri: redirectUri,
      scope: provider.scopes.join(','),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })
    return `${provider.authorizationUrl}?${params.toString()}`
  }

  async callback(platform: string, code: string, state: string) {
    const provider = OAUTH_PROVIDERS[platform]
    if (!provider) throw new BadRequestException(`OAuth is not configured for ${platform}`)

    const record = await this.prisma.withSystem((tx) =>
      tx.oAuthState.findUnique({ where: { state } })
    )
    if (!record || record.platform !== platform || record.expiresAt < new Date()) {
      throw new BadRequestException('OAuth state is invalid or expired')
    }
    await this.prisma.withOrg(record.organizationId, (tx) =>
      tx.oAuthState.delete({ where: { id: record.id } })
    )

    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('FACEBOOK_APP_ID'),
      client_secret: this.config.getOrThrow<string>('FACEBOOK_APP_SECRET'),
      code,
      redirect_uri: record.redirectUri,
      code_verifier: record.codeVerifier
    })
    const response = await fetch(`${provider.tokenUrl}?${params.toString()}`)
    const data = (await response.json().catch(() => ({}))) as TokenResponse
    if (!response.ok || !data.access_token) {
      throw new BadRequestException(data.error?.message ?? `OAuth token exchange failed (${response.status})`)
    }

    const identity = await this.resolveIdentity(provider.graphBase, data.access_token, platform)
    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined
    return this.accounts.connect({
      organizationId: record.organizationId,
      platform,
      externalId: identity.id,
      displayName: identity.name,
      token: data.access_token,
      scopes: data.scopes?.split(',') ?? provider.scopes,
      metadata: identity.metadata,
      expiresAt
    })
  }

  private async resolveIdentity(graphBase: string, token: string, platform: string) {
    const response = await fetch(
      `${graphBase}/me/accounts?fields=id,name,instagram_business_account{id}&access_token=${encodeURIComponent(token)}`
    )
    const data = (await response.json().catch(() => ({}))) as {
      data?: Array<{ id: string; name: string; instagram_business_account?: { id: string } }>
      error?: { message: string }
    }
    if (!response.ok) throw new BadRequestException(data.error?.message ?? 'Failed to read Graph API identity')
    const page = data.data?.[0]
    if (!page) throw new BadRequestException('No Facebook Page available for this token')

    if (platform === 'instagram') {
      const igId = page.instagram_business_account?.id
      if (!igId) throw new BadRequestException('Page has no linked Instagram Business account')
      return { id: igId, name: `${page.name} · Instagram`, metadata: { pageId: page.id, igUserId: igId } }
    }
    return { id: page.id, name: page.name, metadata: { pageId: page.id } }
  }
}
