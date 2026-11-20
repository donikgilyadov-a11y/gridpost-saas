import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const source = readFileSync(join(root, 'src/auth/totp.ts'), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', js)(require, module, module.exports)
const { verifyTotp, generateTotpSecret, otpauthUrl } = module.exports

test('TOTP matches RFC 6238 test vector and rejects wrong codes', () => {
  // RFC 6238 secret "12345678901234567890" in base32; counter=1 at t=59s → 94287082
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  const originalNow = Date.now
  Date.now = () => 59_000
  try {
    assert.equal(verifyTotp(secret, '287082'), true)
    assert.equal(verifyTotp(secret, '000000'), false)
    assert.equal(verifyTotp(secret, '12345'), false)
  } finally {
    Date.now = originalNow
  }
})

test('generated MFA secret produces an otpauth URL', () => {
  const secret = generateTotpSecret()
  assert.match(secret, /^[A-Z2-7]{32}$/)
  assert.match(otpauthUrl('user@example.com', secret), /^otpauth:\/\/totp\/Gridpost%3Auser%40example\.com\?secret=/)
})
