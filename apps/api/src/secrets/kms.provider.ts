import { KMSClient, DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface DataKey {
  plaintext: Buffer
  ciphertext: Buffer
}

export interface KmsProvider {
  generateDataKey(): Promise<DataKey>
  decrypt(ciphertext: Buffer): Promise<Buffer>
}

/** Development/local provider: a master key from env wraps each organization data key. */
export class EnvKmsProvider implements KmsProvider {
  constructor(private readonly masterKey: Buffer) {}

  async generateDataKey(): Promise<DataKey> {
    const plaintext = randomBytes(32)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv)
    const data = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return { plaintext, ciphertext: Buffer.concat([iv, cipher.getAuthTag(), data]) }
  }

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    const iv = ciphertext.subarray(0, 12)
    const tag = ciphertext.subarray(12, 28)
    const data = ciphertext.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()])
  }
}

/** Production provider: KMS owns the master key; only wrapped keys are persisted. */
export class AwsKmsProvider implements KmsProvider {
  private readonly client: KMSClient

  constructor(private readonly keyId: string, region?: string) {
    this.client = new KMSClient(region ? { region } : {})
  }

  async generateDataKey(): Promise<DataKey> {
    const result = await this.client.send(
      new GenerateDataKeyCommand({ KeyId: this.keyId, KeySpec: 'AES_256' })
    )
    if (!result.Plaintext || !result.CiphertextBlob) throw new Error('KMS did not return a data key')
    return { plaintext: Buffer.from(result.Plaintext), ciphertext: Buffer.from(result.CiphertextBlob) }
  }

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    const result = await this.client.send(new DecryptCommand({ CiphertextBlob: ciphertext }))
    if (!result.Plaintext) throw new Error('KMS did not decrypt the data key')
    return Buffer.from(result.Plaintext)
  }
}
