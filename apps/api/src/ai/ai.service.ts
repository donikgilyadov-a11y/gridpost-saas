import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PLATFORM_CAPABILITIES, type PlatformId } from '@gridpost/shared'
import { BrandVoiceService, type BrandVoiceInput } from './brand-voice.service'
import { MockHttpProvider, OllamaProvider, OpenAiProvider, parseJsonResponse, type AiProvider } from './ai.provider'

export interface ContentVariant {
  platform: string
  title: string
  text: string
  hook: string
  hashtags: string[]
  cta: string
}

export interface PlanItem {
  day: number
  platform: string
  topic: string
  reason: string
  suggestedTime: string
}

interface ContentResponse {
  variants?: ContentVariant[]
}

interface PlanResponse {
  items?: PlanItem[]
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name)
  private provider!: AiProvider

  constructor(
    private readonly config: ConfigService,
    private readonly brandVoice: BrandVoiceService
  ) {}

  onModuleInit(): void {
    const kind = this.config.get<string>('AI_PROVIDER') ?? 'openai'
    if (kind === 'ollama') {
      this.provider = new OllamaProvider(
        this.config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434',
        this.config.get<string>('OLLAMA_MODEL') ?? 'qwen2.5:7b'
      )
    } else if (kind === 'mock') {
      this.provider = new MockHttpProvider(this.config.getOrThrow<string>('AI_MOCK_URL'))
    } else {
      this.provider = new OpenAiProvider(
        this.config.get<string>('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1',
        this.config.getOrThrow<string>('OPENAI_API_KEY'),
        this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini'
      )
    }
    this.logger.log(`AI provider: ${kind}`)
  }

  private voiceBlock(voice: BrandVoiceInput): string {
    return [
      `Tone: ${voice.tone}`,
      `Audience: ${voice.audience}`,
      `Language: ${voice.language}`,
      `Preferred length: ~${voice.preferredLength} characters`,
      voice.forbiddenWords.length ? `NEVER use these words: ${voice.forbiddenWords.join(', ')}` : '',
      voice.phrases.length ? `Preferred brand phrases: ${voice.phrases.join(', ')}` : ''
    ].filter(Boolean).join('\n')
  }

  async content(topic: string, platforms: string[], organizationId: string): Promise<ContentVariant[]> {
    const voice = await this.brandVoice.get(organizationId)
    const rules = platforms.map((id) => {
      const caps = PLATFORM_CAPABILITIES[id as PlatformId]
      return `- ${id}: ${caps?.note ?? (caps?.threads ? 'threads supported' : 'single post')}; ${voice.preferredLength} chars max`
    }).join('\n')

    const prompt = [
      'You are a social media content strategist. Return ONLY valid JSON.',
      'JSON shape: {"variants":[{"platform":"...","title":"...","text":"...","hook":"...","hashtags":["..."],"cta":"..."}]}',
      `Topic: ${topic}`,
      'Platform rules:', rules,
      'Brand voice:', this.voiceBlock(voice),
      'Adapt the message to each platform natively — do not merely trim the same text.'
    ].join('\n')

    const data = parseJsonResponse<ContentResponse>(await this.provider.complete(prompt))
    return data.variants ?? []
  }

  async plan(topic: string, weeks: number, organizationId: string): Promise<PlanItem[]> {
    const voice = await this.brandVoice.get(organizationId)
    const prompt = [
      'You are a marketing planner. Return ONLY valid JSON.',
      'JSON shape: {"items":[{"day":1,"platform":"...","topic":"...","reason":"...","suggestedTime":"09:00"}]}',
      `Topic: ${topic}`,
      `Weeks: ${weeks}`,
      'Brand voice:', this.voiceBlock(voice),
      'Include mix of platforms and explain why each post should work.'
    ].join('\n')

    const data = parseJsonResponse<PlanResponse>(await this.provider.complete(prompt))
    return data.items ?? []
  }
}
