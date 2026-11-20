import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Real integration smoke tests. Skipped by default: they require live credentials
 * and network access. Run with LIVE_INTEGRATION=1 after filling the env vars.
 * Mock tests in the other files prove logic; these prove actual platform access.
 */
const enabled = process.env.LIVE_INTEGRATION === '1'

test('live API health', { skip: !enabled && 'set LIVE_INTEGRATION=1' }, async () => {
  const base = process.env.LIVE_API_URL
  assert.ok(base, 'LIVE_API_URL is required')
  const response = await fetch(`${base}/api/v1/health`)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, 'ok')
  assert.equal(body.db, 'up')
})

test('live Telegram publishing', { skip: !enabled && 'set LIVE_INTEGRATION=1' }, async () => {
  assert.ok(process.env.LIVE_TELEGRAM_TOKEN, 'LIVE_TELEGRAM_TOKEN is required')
  assert.ok(process.env.LIVE_TELEGRAM_CHAT, 'LIVE_TELEGRAM_CHAT is required')
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.LIVE_TELEGRAM_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.LIVE_TELEGRAM_CHAT,
        text: `Gridpost live test ${new Date().toISOString()}`
      })
    }
  )
  const body = await response.json()
  assert.equal(body.ok, true, body.description ?? 'Telegram rejected the message')
})

test('live OAuth provider configuration', { skip: !enabled && 'set LIVE_INTEGRATION=1' }, async () => {
  const required = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'X_CLIENT_ID', 'X_CLIENT_SECRET']
  for (const key of required) assert.ok(process.env[key], `${key} is required`)
  // A real OAuth callback requires browser consent; verify credentials are present only.
})
