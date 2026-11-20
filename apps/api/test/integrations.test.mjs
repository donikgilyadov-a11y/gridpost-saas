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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)(require, module, module.exports)
  return module.exports
}

async function mockServer(handler) {
  const calls = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      calls.push({ url: req.url, method: req.method, body })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(handler(req.url, calls.length)))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { base: `http://127.0.0.1:${server.address().port}`, calls, close: () => server.close() }
}

test('X adapter publishes a reply chain', async () => {
  const mock = await mockServer((_url, n) => ({ data: { id: `tw_${n}` } }))
  process.env.X_API = mock.base
  try {
    const { publishX } = loadTs('src/publishing/adapters/x.ts')
    const result = await publishX({ token: 'x-token', thread: ['первый', 'второй'] })
    assert.equal(result.remoteId, 'tw_1')
    assert.match(mock.calls[1].body, /in_reply_to_tweet_id.*tw_1/)
  } finally {
    mock.close()
  }
})

test('Mastodon adapter sends a thread and native schedule only for the first post', async () => {
  const mock = await mockServer((_url, n) => ({ id: `m_${n}`, url: `https://mastodon.test/@u/${n}` }))
  process.env.MASTODON_SCHEME = 'http'
  try {
    const { publishMastodon } = loadTs('src/publishing/adapters/mastodon.ts')
    const result = await publishMastodon({
      token: 'm-token',
      host: mock.base.replace('http://', ''),
      thread: ['a', 'b'],
      scheduledAt: new Date('2030-01-01T00:00:00Z')
    })
    assert.equal(result.remoteId, 'm_1')
    assert.equal(result.nativeScheduling, true)
  } finally {
    mock.close()
  }
})

test('Bluesky adapter resolves DID and creates a reply chain', async () => {
  const mock = await mockServer((url, n) => {
    if (url.includes('resolveHandle')) return { did: 'did:plc:test' }
    return { uri: `at://did:plc:test/app.bsky.feed.post/${n}`, cid: `cid${n}` }
  })
  try {
    const { publishBluesky } = loadTs('src/publishing/adapters/bluesky.ts')
    const result = await publishBluesky({ token: 'bsky-token', handle: 'test.bsky.social', pds: mock.base, thread: ['a', 'b'] })
    assert.match(result.remoteId, /at:\/\/did:plc:test/)
    assert.equal(result.url, 'https://bsky.app/profile/did:plc:test/post/2')
    assert.match(mock.calls[2].body, /"reply"/)
  } finally {
    mock.close()
  }
})

test('YouTube adapter performs resumable upload of an S3 video', async () => {
  let base = ''
  const server = createServer((req, res) => {
    if (req.url?.includes('video.mp4')) {
      res.writeHead(200, { 'content-type': 'video/mp4' })
      res.end(Buffer.from([1, 2, 3, 4]))
      return
    }
    if (req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json', location: `${base}/upload` })
      res.end('{}')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: 'yt_1' }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  process.env.YOUTUBE_API = base
  try {
    const { publishYouTube } = loadTs('src/publishing/adapters/youtube.ts')
    const result = await publishYouTube({
      token: 'yt-token',
      videoUrl: `${base}/video.mp4`,
      title: 'Тестовое видео'
    })
    assert.equal(result.remoteId, 'yt_1')
    assert.equal(result.url, 'https://www.youtube.com/watch?v=yt_1')
  } finally {
    server.close()
  }
})

test('TikTok adapter initializes publish and polls for completion', async () => {
  const calls = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      calls.push({ url: req.url, body })
      res.writeHead(200, { 'content-type': 'application/json' })
      const response = req.url?.includes('init')
        ? { data: { publish_id: 'publish_1' } }
        : { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['tt_1'] } }
      res.end(JSON.stringify(response))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.TIKTOK_API = `http://127.0.0.1:${server.address().port}/v2`
  try {
    const { publishTikTok } = loadTs('src/publishing/adapters/tiktok.ts')
    const result = await publishTikTok({
      token: 'tt-token',
      videoUrl: 'https://cdn.test/video.mp4',
      title: 'Тест'
    })
    assert.equal(result.remoteId, 'tt_1')
    assert.match(calls[0].body, /PULL_URL/)
    assert.match(calls[1].body, /publish_1/)
  } finally {
    server.close()
  }
})
