import { createHmac, randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer): string {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  return out
}

function base32Decode(value: string): Buffer {
  const bits = value.toUpperCase().split('').map((char) => ALPHABET.indexOf(char).toString(2).padStart(5, '0')).join('')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`Gridpost:${email}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=Gridpost&algorithm=SHA1&digits=6&period=30`
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const key = base32Decode(secret)
  const counter = Math.floor(Date.now() / 30_000)
  for (let offset = -window; offset <= window; offset += 1) {
    const buffer = Buffer.alloc(8)
    buffer.writeBigUInt64BE(BigInt(counter + offset))
    const hmac = createHmac('sha1', key).update(buffer).digest()
    const index = hmac[hmac.length - 1] & 0x0f
    const value = (hmac.readUInt32BE(index) & 0x7fffffff) % 1_000_000
    if (value.toString().padStart(6, '0') === code) return true
  }
  return false
}
