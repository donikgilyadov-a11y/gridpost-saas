import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function transpile(relativePath) {
  const source = readFileSync(join(root, relativePath), 'utf8')
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true
    }
  }).outputText
}

function load(relativePath, stubs = {}) {
  const module = { exports: {} }
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(stubs, specifier)) return stubs[specifier]
    return require(specifier)
  }
  new Function('require', 'module', 'exports', transpile(relativePath))(localRequire, module, module.exports)
  return module.exports
}

// ── 1. RLS SQL structure ──────────────────────────────────────────────
test('RLS policies do not reference organization_id on tables that lack it', () => {
  const rls = readFileSync(join(root, 'prisma/rls.sql'), 'utf8')
  const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')

  const loopMatch = rls.match(/FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\]/)
  assert.ok(loopMatch, 'generic policy loop not found')
  const loopTables = [...loopMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.ok(!loopTables.includes('organizations'), 'organizations must not be in the generic loop')
  assert.ok(!loopTables.includes('users'), 'users must not be in the generic loop')

  for (const table of loopTables) {
    const model = [...schema.matchAll(/model\s+\w+\s*\{([\s\S]*?)\n\}/g)]
      .find((m) => m[1].includes(`@@map("${table}")`))
    assert.ok(model, `model for table ${table} missing in schema`)
    assert.match(model[1], /organizationId\s+String/, `${table} has no organizationId field`)
  }
  assert.match(rls, /CREATE POLICY org_self ON organizations[\s\S]*?id = app_current_org\(\)/)
  assert.match(rls, /CREATE POLICY user_self ON users/)
})

// ── 2. Auth uses a bounded system context ──────────────────────────────
test('register and login run bootstrap queries in system context', async () => {
  const calls = []
  const tx = {
    user: {
      findUnique: async ({ include }) => include
        ? {
            id: 'u1',
            email: 'a@b.c',
            passwordHash: 'hash',
            mfaEnabled: false,
            memberships: [{ organizationId: 'o1', role: 'OWNER' }]
          }
        : null,
      create: async ({ data }) => ({ id: 'u1', email: data.email }),
      findUniqueOrThrow: async () => ({ id: 'u1', mfaEnabled: false }),
      update: async () => ({})
    },
    organization: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: 'o1', ...data })
    },
    membership: { create: async () => ({}) }
  }
  const prisma = {
    withSystem: async (fn) => { calls.push('system'); return fn(tx) },
    withOrg: async (org, fn) => { calls.push(`org:${org}`); return fn(tx) }
  }
  const stubs = {
    '@nestjs/common': { Injectable: () => () => undefined, ConflictException: Error, UnauthorizedException: Error },
    '@nestjs/config': { ConfigService: class {} },
    '@nestjs/jwt': { JwtService: class { sign() { return 'token' } } },
    bcryptjs: { hash: async () => 'hash', compare: async () => true },
    '../prisma/prisma.service': { PrismaService: class {} },
    './totp': { generateTotpSecret: () => 'SECRET', otpauthUrl: () => 'otpauth://', verifyTotp: () => true }
  }
  const { AuthService } = load('src/auth/auth.service.ts', stubs)
  const service = new AuthService(prisma, new stubs['@nestjs/jwt'].JwtService(), {})
  await service.register({ email: 'a@b.c', password: 'password123', displayName: 'A', organizationName: 'Org' })
  assert.ok(calls.includes('system'), 'register did not use system context')
  calls.length = 0
  await service.login({ email: 'a@b.c', password: 'password123' })
  assert.ok(calls.includes('system'), 'login did not use system context')
})

// ── 3. Key rotation is resumable ───────────────────────────────────────
test('key rotation is idempotent and can resume after a partial failure', async () => {
  const keyRows = new Map()
  const accounts = [{ id: 'a1', keyVersion: 1, tokenCipher: Buffer.alloc(32, 1), tokenIv: Buffer.alloc(12, 2) }]
  let failNextUpdate = true
  const tx = {
    organizationKey: {
      findUnique: async ({ where }) => keyRows.get(where.version) ?? null,
      findFirst: async () => [...keyRows.values()].sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }) => { keyRows.set(data.version, { ...data }); return { ...data } }
    },
    socialAccount: {
      findMany: async ({ where }) => accounts.filter((a) => a.keyVersion !== where.keyVersion.not),
      updateMany: async ({ data }) => {
        if (failNextUpdate) throw new Error('simulated outage')
        Object.assign(accounts[0], data)
        return { count: 1 }
      }
    }
  }
  const prisma = { withOrg: async (_org, fn) => fn(tx) }
  const stubs = {
    '@nestjs/common': { Injectable: () => () => undefined, Logger: class { log() {} warn() {} } },
    '@nestjs/config': { ConfigService: class {} },
    '../prisma/prisma.service': { PrismaService: class {} },
    './kms.provider': {
      EnvKmsProvider: class {
        async generateDataKey() { return { plaintext: Buffer.alloc(32, 7), ciphertext: Buffer.from('wrapped') } }
        async decrypt() { return Buffer.alloc(32, 7) }
      },
      AwsKmsProvider: class {}
    }
  }
  const { SecretsService } = load('src/secrets/secrets.service.ts', stubs)
  const service = new SecretsService(
    { get: () => 'env', getOrThrow: () => Buffer.alloc(32, 9).toString('base64') },
    prisma
  )
  service.onModuleInit()
  const initial = await service.encrypt('o1', 'initial-token')
  accounts[0].tokenCipher = initial.cipher
  accounts[0].tokenIv = initial.iv
  accounts[0].keyVersion = initial.keyVersion

  const first = await service.rotate('o1')
  assert.equal(first.version, 2)
  assert.equal(first.rotated, 0)
  assert.equal(first.failed.length, 1)
  assert.ok(keyRows.has(2), 'new key version was not created')

  failNextUpdate = false
  const second = await service.rotate('o1')
  assert.equal(second.version, 2, 'rotation did not resume on the same target version')
  assert.equal(second.rotated, 1)
  assert.equal(second.failed.length, 0)
  assert.equal(accounts[0].keyVersion, 2)
})

// ── 4. Stuck-task recovery ─────────────────────────────────────────────
test('stuck publishing targets are requeued, published ones are left alone', async () => {
  const enqueued = []
  const tx = {
    postTarget: {
      findMany: async ({ where }) =>
        where.status === 'PUBLISHING' ? [{ id: 'stuck1', postId: 'p1', accountId: 'a1', lang: 'RU' }] : []
    },
    socialAccount: {
      findMany: async () => [{ id: 'a1', platform: 'telegram' }],
      findUniqueOrThrow: async () => ({ id: 'a1', platform: 'telegram' })
    }
  }
  const prisma = { withOrg: async (_org, fn) => fn(tx) }
  const queue = { enqueue: async (payload) => enqueued.push(payload) }
  const stubs = {
    '@nestjs/common': { Injectable: () => () => undefined, ForbiddenException: Error, NotFoundException: Error },
    '@prisma/client': { Prisma: {} },
    '../prisma/prisma.service': { PrismaService: class {} },
    '../queue/queue.service': { QueueService: class {} },
    '../billing/billing.service': { BillingService: class {} }
  }
  const { PostsService } = load('src/publishing/posts.service.ts', stubs)
  const service = new PostsService(prisma, queue, { limitsFor: async () => ({ accounts: 5 }) })

  const recovered = await service.recoverStuck('o1')
  assert.equal(recovered, 1)
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0].targetId, 'stuck1')
  assert.equal(enqueued[0].platform, 'telegram')
})

// ── 5. Publisher idempotency and failure handling ──────────────────────
test('publisher skips published targets and classifies permanent errors', async () => {
  class UnrecoverableError extends Error {}
  const state = {
    target: { id: 't1', status: 'PENDING', remoteId: null },
    attempts: 0,
    updates: [],
    adapterError: null
  }
  const tx = {
    postTarget: {
      findUnique: async () => ({ ...state.target, organizationId: 'o1' }),
      update: async ({ data }) => { state.updates.push(data); Object.assign(state.target, data) },
      findMany: async () => [state.target]
    },
    $queryRaw: async () => { state.attempts += 1; return [{ id: 't1' }] },
    socialAccount: { findUniqueOrThrow: async () => ({
      id: 'a1', tokenCipher: Buffer.from('x'), tokenIv: Buffer.from('y'), keyVersion: 1,
      status: 'ACTIVE', metadata: { chatId: '@test' }, expiresAt: null
    }) },
    post: {
      findUniqueOrThrow: async () => ({ variants: { RU: ['hello'] }, media: [] }),
      update: async () => ({}),
      findMany: async () => []
    }
  }
  const prisma = {
    withOrg: async (_org, fn) => fn(tx),
    postTarget: { findUnique: async () => ({ ...state.target }) }
  }
  const secrets = { decrypt: async () => 'token' }
  const adapterStubs = {
    './adapters/telegram': { publishTelegram: async () => { if (state.adapterError) throw state.adapterError; return { remoteId: 'm1' } } },
    './adapters/facebook': { publishFacebook: async () => ({ remoteId: 'f1' }) },
    './adapters/instagram': { publishInstagram: async () => ({ remoteId: 'i1' }) },
    './adapters/linkedin': { publishLinkedIn: async () => ({ remoteId: 'l1' }) },
    './adapters/x': { publishX: async () => ({ remoteId: 'x1' }) },
    './adapters/bluesky': { publishBluesky: async () => ({ remoteId: 'b1' }) },
    './adapters/mastodon': { publishMastodon: async () => ({ remoteId: 'm1' }) },
    './adapters/threads': { publishThreads: async () => ({ remoteId: 'th1' }) },
    './adapters/pinterest': { publishPinterest: async () => ({ remoteId: 'p1' }) },
    './adapters/youtube': { publishYouTube: async () => ({ remoteId: 'yt1' }) },
    './adapters/tiktok': { publishTikTok: async () => ({ remoteId: 'tt1' }) }
  }
  const stubs = {
    '@nestjs/common': { Injectable: () => () => undefined, Logger: class { log() {} warn() {} error() {} } },
    '@prisma/client': { TargetStatus: {} },
    bullmq: { UnrecoverableError },
    '../prisma/prisma.service': { PrismaService: class {} },
    '../secrets/secrets.service': { SecretsService: class {} },
    ...adapterStubs
  }
  const { PublisherService } = load('src/publishing/publisher.service.ts', stubs)
  const publisher = new PublisherService(prisma, secrets)
  const payload = {
    organizationId: 'o1', postId: 'p1', targetId: 't1', accountId: 'a1',
    platform: 'telegram', lang: 'RU', idempotencyKey: 'k1'
  }

  state.target.status = 'PUBLISHED'
  await publisher.process(payload)
  assert.equal(state.attempts, 0, 'published target was claimed again')

  state.target.status = 'PENDING'
  state.adapterError = new Error('HTTP 500')
  await publisher.process(payload).catch(() => undefined)
  assert.equal(state.updates.at(-1)?.status, 'FAILED')
  assert.equal(state.attempts, 1)

  state.target.status = 'FAILED'
  state.adapterError = new Error('HTTP 400 Bad Request')
  await assert.rejects(() => publisher.process(payload), UnrecoverableError)
  assert.equal(state.updates.at(-1)?.status, 'FAILED')
})
