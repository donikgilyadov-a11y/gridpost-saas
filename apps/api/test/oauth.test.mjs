import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const source = readFileSync(join(root, 'src/oauth/oauth.providers.ts'), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', js)(require, module, module.exports)
const { OAUTH_PROVIDERS } = module.exports

test('LinkedIn uses body token auth and w_member_social scope', () => {
  const provider = OAUTH_PROVIDERS.linkedin
  assert.equal(provider.tokenAuth, 'body')
  assert.equal(provider.usePkce, false)
  assert.ok(provider.scopes.includes('w_member_social'))
  assert.equal(provider.identityKind, 'linkedin-userinfo')
})

test('X uses PKCE and Basic token auth', () => {
  const provider = OAUTH_PROVIDERS.x
  assert.equal(provider.tokenAuth, 'basic')
  assert.equal(provider.usePkce, true)
  assert.ok(provider.scopes.includes('tweet.write'))
  assert.equal(provider.identityKind, 'x-me')
})
