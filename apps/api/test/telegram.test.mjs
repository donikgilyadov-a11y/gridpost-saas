import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function loadTs(relativePath) {
  const source = readFileSync(join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)(require, module, module.exports)
  return module.exports
}

test('telegram adapter publishes a thread through a mock Bot API', async () => {
  const requests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      requests.push({ url: req.url, body: JSON.parse(body) })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, result: { message_id: 500 + requests.length } }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.TELEGRAM_API = `http://127.0.0.1:${server.address().port}`

  try {
    const { publishTelegram } = loadTs('src/publishing/adapters/telegram.ts')
    const outcome = await publishTelegram({
      token: '123:TEST',
      chatId: '@gridpost_demo',
      thread: ['Первый пост', 'Второй **жирный** пост']
    })

    assert.equal(requests.length, 2)
    assert.ok(requests[0].url.includes('/sendMessage'))
    assert.equal(requests[0].body.text, 'Первый пост')
    assert.equal(requests[1].body.text, 'Второй <b>жирный</b> пост')
    assert.equal(requests[1].body.reply_to_message_id, 501)
    assert.equal(outcome.remoteId, '501')
    assert.equal(outcome.url, 'https://t.me/gridpost_demo/501')
  } finally {
    server.close()
  }
})

test('facebook adapter publishes each thread post to the page feed', async () => {
  const requests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      requests.push({ url: req.url, params: new URLSearchParams(body) })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: `fb_${requests.length}` }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.FACEBOOK_API = `http://127.0.0.1:${server.address().port}`

  try {
    const { publishFacebook } = loadTs('src/publishing/adapters/facebook.ts')
    const outcome = await publishFacebook({
      token: 'fb-token',
      pageId: 'page123',
      thread: ['Первый', 'Второй']
    })
    assert.equal(requests.length, 2)
    assert.ok(requests[0].url.includes('/page123/feed'))
    assert.equal(requests[0].params.get('message'), 'Первый')
    assert.equal(outcome.remoteId, 'fb_1')
    assert.equal(outcome.url, 'https://www.facebook.com/fb_1')
  } finally {
    server.close()
  }
})

test('instagram adapter creates a container and publishes it', async () => {
  const calls = []
  const server = createServer((req, res) => {
    const url = req.url ?? ''
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      calls.push({ url, method: req.method, params: new URLSearchParams(body) })
      res.writeHead(200, { 'content-type': 'application/json' })
      if (url.includes('status_code')) res.end(JSON.stringify({ status_code: 'FINISHED' }))
      else if (url.includes('shortcode')) res.end(JSON.stringify({ shortcode: 'ABC123' }))
      else if (url.includes('media_publish')) res.end(JSON.stringify({ id: 'ig_99' }))
      else res.end(JSON.stringify({ id: 'container_1' }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.INSTAGRAM_API = `http://127.0.0.1:${server.address().port}`

  try {
    const { publishInstagram } = loadTs('src/publishing/adapters/instagram.ts')
    const outcome = await publishInstagram({
      token: 'ig-token',
      igUserId: 'ig_user',
      caption: 'Привет из Gridpost',
      imageUrl: 'https://cdn.test/post.jpg'
    })
    assert.ok(calls.some((call) => call.url.includes('/ig_user/media') && call.method === 'POST'))
    assert.ok(calls.some((call) => call.url.includes('media_publish')))
    assert.equal(outcome.remoteId, 'ig_99')
    assert.equal(outcome.url, 'https://www.instagram.com/p/ABC123/')
  } finally {
    server.close()
  }
})

test('facebook and instagram stats adapters normalize Insights responses', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      data: [
        { name: 'post_impressions', values: [{ value: 1200 }] },
        { name: 'post_reach', values: [{ value: 900 }] },
        { name: 'impressions', values: [{ value: 800 }] },
        { name: 'reach', values: [{ value: 600 }] },
        { name: 'likes', values: [{ value: 45 }] },
        { name: 'comments', values: [{ value: 7 }] },
        { name: 'saved', values: [{ value: 12 }] },
        { name: 'post_engaged_users', values: [{ value: 60 }] }
      ]
    }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  process.env.FACEBOOK_API = base
  process.env.INSTAGRAM_API = base

  try {
    const facebook = loadTs('src/publishing/adapters/facebook.ts')
    const instagram = loadTs('src/publishing/adapters/instagram.ts')
    const fb = await facebook.fetchFacebookStats('token', 'fb_1')
    assert.equal(fb.impressions, 1200)
    assert.equal(fb.engagements, 60)
    const ig = await instagram.fetchInstagramStats('token', 'ig_1')
    assert.equal(ig.reach, 600)
    assert.equal(ig.likes, 45)
    assert.equal(ig.shares, 12)
  } finally {
    server.close()
  }
})
