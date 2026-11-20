export interface OAuthProviderConfig {
  id: 'facebook' | 'instagram'
  authorizationUrl: string
  tokenUrl: string
  graphBase: string
  scopes: string[]
}

const FB_API = 'https://graph.facebook.com/v19.0'

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  facebook: {
    id: 'facebook',
    authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: `${FB_API}/oauth/access_token`,
    graphBase: FB_API,
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list']
  },
  instagram: {
    id: 'instagram',
    authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: `${FB_API}/oauth/access_token`,
    graphBase: FB_API,
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list']
  }
}
