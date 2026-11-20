import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AwsKmsProvider, EnvKmsProvider, type KmsProvider } from './kms.provider'

export interface SealedSecret {
  cipher: Buffer
  iv: Buffer
  keyVersion: number
}

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name)
  private provider!: KmsProvider
  private readonly cache = new Map<string, Buffer>()

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  onModuleInit(): void {
    const kind = this.config.get<string>('KMS_PROVIDER') ?? 'env'
    if (kind === 'aws') {
      const keyId = this.config.getOrThrow<string>('KMS_KEY_ID')
      this.provider = new AwsKmsProvider(keyId, this.config.get<string>('AWS_REGION'))
    } else if (kind === 'env') {
      const raw = this.config.getOrThrow<string>('TOKEN_MASTER_KEY')
      const master = Buffer.from(raw, 'base64')
      if (master.length !== 32) throw new Error('TOKEN_MASTER_KEY must be a base64-encoded 32-byte key')
      this.provider = new EnvKmsProvider(master)
    } else {
      throw new Error(`Unknown KMS_PROVIDER: ${kind}`)
    }
    this.logger.log(`token encryption provider: ${kind}`)
  }

  private async key(organizationId: string, version?: number): Promise<{ key: Buffer; version: number }> {
    const record = await this.prisma.withOrg(organizationId, (tx) =>
      version
        ? tx.organizationKey.findUnique({
            where: { organizationId_version: { organizationId, version } }
          })
        : tx.organizationKey.findFirst({
            where: { organizationId },
            orderBy: { version: 'desc' }
          })
    )

    if (!record) {
      const generated = await this.provider.generateDataKey()
      const created = await this.prisma.withOrg(organizationId, (tx) =>
        tx.organizationKey.create({
          data: { organizationId, version: 1, ciphertext: generated.ciphertext }
        })
      )
      this.cache.set(`${organizationId}:1`, generated.plaintext)
      return { key: generated.plaintext, version: created.version }
    }

    const cacheKey = `${organizationId}:${record.version}`
    const cached = this.cache.get(cacheKey)
    if (cached) return { key: cached, version: record.version }
    const key = await this.provider.decrypt(record.ciphertext)
    this.cache.set(cacheKey, key)
    return { key, version: record.version }
  }

  async encrypt(organizationId: string, plaintext: string): Promise<SealedSecret> {
    const { key, version } = await this.key(organizationId)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(organizationId))
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return { cipher: Buffer.concat([data, cipher.getAuthTag()]), iv, keyVersion: version }
  }

  async decrypt(organizationId: string, sealed: SealedSecret): Promise<string> {
    const { key } = await this.key(organizationId, sealed.keyVersion)
    const tag = sealed.cipher.subarray(sealed.cipher.length - 16)
    const data = sealed.cipher.subarray(0, sealed.cipher.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.iv)
    decipher.setAAD(Buffer.from(organizationId))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  }

  /** Creates a new organization data key and re-encrypts all stored tokens. */
  async rotate(organizationId: string): Promise<number> {
    const currentVersion = (await this.key(organizationId)).version
    const generated = await this.provider.generateDataKey()
    const newVersion = currentVersion + 1
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.organizationKey.create({
        data: { organizationId, version: newVersion, ciphertext: generated.ciphertext }
      })
    )
    this.cache.set(`${organizationId}:${newVersion}`, generated.plaintext)

    const accounts = await this.prisma.withOrg(organizationId, (tx) =>
      tx.socialAccount.findMany({ where: { organizationId } })
    )
    for (const account of accounts) {
      const plaintext = await this.decrypt(organizationId, {
        cipher: account.tokenCipher,
        iv: account.tokenIv,
        keyVersion: account.keyVersion
      })
      const sealed = await this.encrypt(organizationId, plaintext)
      await this.prisma.withOrg(organizationId, (tx) =>
        tx.socialAccount.update({
          where: { id: account.id },
          data: { tokenCipher: sealed.cipher, tokenIv: sealed.iv, keyVersion: sealed.keyVersion }
        })
      )
    }
    this.logger.log(`rotated org ${organizationId} key to v${newVersion} (${accounts.length} tokens)`)
    return accounts.length
  }
}
