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

const loaded = new Map()

function loadTs(relativePath) {
  const fullPath = join(root, relativePath)
  if (loaded.has(fullPath)) return loaded.get(fullPath)
  const source = readFileSync(fullPath, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true
    }
  }).outputText
  const module = { exports: {} }
  loaded.set(fullPath, module.exports)
  const localRequire = (specifier) =>
    specifier.startsWith('.')
      ? loadTs(join(dirname(relativePath), `${specifier}.ts`))
      : require(specifier)
  new Function('require', 'module', 'exports', js)(localRequire, module, module.exports)
  loaded.set(fullPath, module.exports)
  return module.exports
}

test('AI content studio adapts a topic per platform and respects brand voice', async () => {
  const prompts = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const { prompt } = JSON.parse(body)
      prompts.push(prompt)
      const completion = prompt.includes('content strategist')
        ? JSON.stringify({
            variants: [
              { platform: 'instagram', title: 'Миланский ресторан', text: 'Вкусно и по-милански', hook: 'Начали!', hashtags: ['милан'], cta: 'Бронируйте' },
              { platform: 'x', title: 'Short', text: 'Ресторан в Милане', hook: 'Новинка', hashtags: [], cta: 'Подробнее' }
            ]
          })
        : JSON.stringify({ items: [{ day: 1, platform: 'instagram', topic: 'Завтрак', reason: 'Утро', suggestedTime: '09:00' }] })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ completion }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/completion`

  try {
    const { AiService } = loadTs('src/ai/ai.service.ts')
    const config = {
      get: (key) => (key === 'AI_PROVIDER' ? 'mock' : key === 'AI_MOCK_URL' ? url : undefined),
      getOrThrow: (key) => (key === 'AI_MOCK_URL' ? url : undefined)
    }
    const voice = {
      get: async () => ({
        tone: 'тёплый',
        audience: ' местные жители',
        forbiddenWords: ['дешёвый'],
        phrases: ['свежие ингредиенты'],
        language: 'ru',
        preferredLength: 400
      })
    }
    const service = new AiService(config, voice)
    service.onModuleInit()

    const variants = await service.content('продвижение ресторана в Милане', ['instagram', 'x'], 'org-1')
    assert.equal(variants.length, 2)
    assert.equal(variants[0].platform, 'instagram')
    assert.match(prompts[0], /не надо|свежие ингредиенты/)
    assert.match(prompts[0], /instagram/)

    const plan = await service.plan('ресторан', 2, 'org-1')
    assert.equal(plan[0].suggestedTime, '09:00')
  } finally {
    server.close()
  }
})
