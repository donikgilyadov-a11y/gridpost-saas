export interface OAuthProviderConfig {
  id: 'facebook' | 'instagram' | 'linkedin' | 'x'
  authorizationUrl: string
  tokenUrl: string
  graphBase?: string
  identityUrl: string
  identityKind: 'graph-accounts' | 'linkedin-userinfo' | 'x-me'
  clientIdEnv: string
  clientSecretEnv: string
  tokenAuth: 'body' | 'basic'
  scopes: string[]
  usePkce: boolean
}

const FB_API = 'https://graph.facebook.com/v19.0'

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  facebook: {
    id: 'facebook',
    authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: `${FB_API}/oauth/access_token`,
    graphBase: FB_API,
    identityUrl: `${FB_API}/me/accounts`,
    identityKind: 'graph-accounts',
    clientIdEnv: 'FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
    tokenAuth: 'body',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
    usePkce: true
  },
  instagram: {
    id: 'instagram',
    authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: `${FB_API}/oauth/access_token`,
    graphBase: FB_API,
    identityUrl: `${FB_API}/me/accounts`,
    identityKind: 'graph-accounts',
    clientIdEnv: 'FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
    tokenAuth: 'body',
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
    usePkce: true
  },
  linkedin: {
    id: 'linkedin',
    authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    identityUrl: 'https://api.linkedin.com/v2/userinfo',
    identityKind: 'linkedin-userinfo',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    tokenAuth: 'body',
    scopes: ['openid', 'profile', 'w_member_social'],
    usePkce: false
  },
  x: {
    id: 'x',
    authorizationUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    identityUrl: 'https://api.x.com/2/users/me',
    identityKind: 'x-me',
    clientIdEnv: 'X_CLIENT_ID',
    clientSecretEnv: 'X_CLIENT_SECRET',
    tokenAuth: 'basic',
    scopes: ['tweet.write', 'tweet.read', 'users.read', 'offline.access'],
    usePkce: true
  }
}
