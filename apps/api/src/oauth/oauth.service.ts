import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { SocialAccountsService } from '../publishing/social-accounts.service'
import { OAUTH_PROVIDERS, type OAuthProviderConfig } from './oauth.providers'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: { message: string }
}

interface Identity {
  id: string
  name: string
  metadata: Record<string, unknown>
  refreshToken?: string
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
      client_id: this.config.getOrThrow<string>(provider.clientIdEnv),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: provider.scopes.join(' '),
      state
    })
    if (provider.usePkce) {
      params.set('code_challenge', challenge)
      params.set('code_challenge_method', 'S256')
    }
    return `${provider.authorizationUrl}?${params.toString()}`
  }

  async callback(platform: string, code: string, state: string) {
    const provider = OAUTH_PROVIDERS[platform]
    if (!provider) throw new BadRequestException(`OAuth is not configured for ${platform}`)
    const record = await this.prisma.withSystem((tx) => tx.oAuthState.findUnique({ where: { state } }))
    if (!record || record.platform !== platform || record.expiresAt < new Date()) {
      throw new BadRequestException('OAuth state is invalid or expired')
    }
    await this.prisma.withOrg(record.organizationId, (tx) => tx.oAuthState.delete({ where: { id: record.id } }))

    const data = await this.exchangeCode(provider, code, record.redirectUri, record.codeVerifier)
    const identity = await this.resolveIdentity(provider, data.access_token)
    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined
    return this.accounts.connect({
      organizationId: record.organizationId,
      platform,
      externalId: identity.id,
      displayName: identity.name,
      token: data.access_token,
      scopes: data.scope?.split(' ') ?? provider.scopes,
      metadata: {
        ...identity.metadata,
        ...(data.refresh_token ? { refreshToken: data.refresh_token } : {})
      },
      expiresAt
    })
  }

  private async exchangeCode(
    provider: OAuthProviderConfig,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<TokenResponse> {
    const clientId = this.config.getOrThrow<string>(provider.clientIdEnv)
    const clientSecret = this.config.getOrThrow<string>(provider.clientSecretEnv)
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    }
    if (provider.usePkce) body.code_verifier = codeVerifier
    if (provider.tokenAuth === 'body') {
      body.client_id = clientId
      body.client_secret = clientSecret
    }
    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(provider.tokenAuth === 'basic'
          ? { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` }
          : {})
      },
      body: new URLSearchParams(body)
    })
    const data = (await response.json().catch(() => ({}))) as TokenResponse
    if (!response.ok || !data.access_token) {
      throw new BadRequestException(data.error?.message ?? `Token exchange failed (${response.status})`)
    }
    return data
  }

  private async resolveIdentity(provider: OAuthProviderConfig, token: string): Promise<Identity> {
    const response = await fetch(`${provider.identityUrl}?access_token=${encodeURIComponent(token)}`, {
      headers: { authorization: `Bearer ${token}` }
    })
    const data = (await response.json().catch(() => ({}))) as {
      data?: Array<{ id: string; name: string; instagram_business_account?: { id: string } }>
      sub?: string
      error?: { message: string }
    }
    if (!response.ok) throw new BadRequestException(data.error?.message ?? 'Failed to read identity')

    if (provider.identityKind === 'linkedin-userinfo') {
      if (!data.sub) throw new BadRequestException('LinkedIn не вернул sub')
      return {
        id: data.sub,
        name: `LinkedIn ${data.sub.slice(0, 8)}`,
        metadata: { authorUrn: `urn:li:person:${data.sub}` }
      }
    }
    if (provider.identityKind === 'x-me') {
      const user = (data as unknown as { data?: { id: string; username?: string } }).data
      if (!user?.id) throw new BadRequestException('X не вернул user id')
      return { id: user.id, name: `@${user.username ?? user.id}`, metadata: {} }
    }
    const page = data.data?.[0]
    if (!page) throw new BadRequestException('No Facebook Page available for this token')
    if (provider.id === 'instagram') {
      const igId = page.instagram_business_account?.id
      if (!igId) throw new BadRequestException('Page has no linked Instagram Business account')
      return { id: igId, name: `${page.name} · Instagram`, metadata: { pageId: page.id, igUserId: igId } }
    }
    return { id: page.id, name: page.name, metadata: { pageId: page.id } }
  }
}
