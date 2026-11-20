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
