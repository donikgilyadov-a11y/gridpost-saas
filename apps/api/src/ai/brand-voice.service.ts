import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface BrandVoiceInput {
  tone: string
  audience: string
  forbiddenWords: string[]
  phrases: string[]
  language: string
  preferredLength: number
}

const EMPTY: BrandVoiceInput = {
  tone: 'дружелюбный, экспертный',
  audience: 'широкая аудитория',
  forbiddenWords: [],
  phrases: [],
  language: 'ru',
  preferredLength: 280
}

@Injectable()
export class BrandVoiceService {
  constructor(private readonly prisma: PrismaService) {}

  get(organizationId: string): Promise<BrandVoiceInput> {
    return this.prisma.withOrg(organizationId, async (tx) => {
      const record = await tx.brandVoice.findUnique({ where: { organizationId } })
      if (!record) return EMPTY
      return {
        tone: record.tone,
        audience: record.audience,
        forbiddenWords: record.forbiddenWords,
        phrases: record.phrases,
        language: record.language,
        preferredLength: record.preferredLength
      }
    })
  }

  async save(organizationId: string, input: BrandVoiceInput): Promise<BrandVoiceInput> {
    await this.prisma.withOrg(organizationId, (tx) =>
      tx.brandVoice.upsert({
        where: { organizationId },
        create: { organizationId, ...input },
        update: input
      })
    )
    return input
  }
}
