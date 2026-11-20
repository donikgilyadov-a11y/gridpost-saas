import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

export interface SealedSecret {
  cipher: Buffer
  iv: Buffer
}

/**
 * P1 envelope encryption. A single master key from the environment derives an
 * organization key via HMAC; `orgId` is additionally used as AAD. P2 replaces
 * the master key with KMS/Vault and adds per-org key rotation.
 */
@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name)
  private masterKey!: Buffer

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.getOrThrow<string>('TOKEN_MASTER_KEY')
    this.masterKey = Buffer.from(raw, 'base64')
    if (this.masterKey.length !== 32) {
      throw new Error('TOKEN_MASTER_KEY must be a base64-encoded 32-byte key')
    }
    this.logger.log('token encryption initialized')
  }

  private orgKey(organizationId: string): Buffer {
    return createHmac('sha256', this.masterKey).update(organizationId).digest()
  }

  encrypt(organizationId: string, plaintext: string): SealedSecret {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.orgKey(organizationId), iv)
    cipher.setAAD(Buffer.from(organizationId))
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return { cipher: Buffer.concat([data, cipher.getAuthTag()]), iv }
  }

  decrypt(organizationId: string, sealed: SealedSecret): string {
    const tag = sealed.cipher.subarray(sealed.cipher.length - 16)
    const data = sealed.cipher.subarray(0, sealed.cipher.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', this.orgKey(organizationId), sealed.iv)
    decipher.setAAD(Buffer.from(organizationId))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  }
}
