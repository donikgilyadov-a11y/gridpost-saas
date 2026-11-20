import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'

const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm'
]
const MAX_BYTES = 50 * 1024 * 1024

@Injectable()
export class MediaService {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBase: string

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    const endpoint = this.config.get<string>('S3_ENDPOINT')
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET')
    this.client = new S3Client({
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_KEY')
      }
    })
    this.publicBase =
      this.config.get<string>('S3_PUBLIC_URL') ??
      (endpoint ? `${endpoint.replace(/\/$/, '')}/${this.bucket}` : `https://${this.bucket}.s3.amazonaws.com`)
  }

  async presign(organizationId: string, input: { name: string; mime: string; size: number; alt?: string }) {
    if (!ALLOWED_MIME.includes(input.mime)) throw new BadRequestException(`Неподдерживаемый тип файла: ${input.mime}`)
    if (input.size <= 0 || input.size > MAX_BYTES) throw new BadRequestException('Файл слишком большой')
    const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
    const id = randomUUID()
    const key = `${organizationId}/${id}-${safeName}`
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.mime,
      Metadata: { organization_id: organizationId }
    })
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 })
    const url = `${this.publicBase}/${key}`
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.mediaAsset.create({
        data: {
          id,
          organizationId,
          name: safeName,
          mime: input.mime,
          size: input.size,
          url,
          alt: input.alt
        }
      })
    )
    return { id, uploadUrl, url, method: 'PUT', expiresIn: 900 }
  }

  async confirm(organizationId: string, id: string) {
    const asset = await this.prisma.withOrg(organizationId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id } })
    )
    if (!asset) throw new NotFoundException('Медиа не найдено')
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.keyFromUrl(asset.url) }))
    } catch {
      throw new BadRequestException('Файл ещё не загружен в хранилище')
    }
    return asset
  }

  list(organizationId: string) {
    return this.prisma.withOrg(organizationId, (tx) =>
      tx.mediaAsset.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 200 })
    )
  }

  async remove(organizationId: string, id: string) {
    const asset = await this.prisma.withOrg(organizationId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id } })
    )
    if (!asset) throw new NotFoundException('Медиа не найдено')
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFromUrl(asset.url) }))
    await this.prisma.withOrg(organizationId, (tx) => tx.mediaAsset.delete({ where: { id } }))
    return { deleted: true }
  }

  private keyFromUrl(url: string): string {
    return url.slice(this.publicBase.length + 1)
  }
}
