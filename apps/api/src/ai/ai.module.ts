import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { BrandVoiceService } from './brand-voice.service'

@Module({
  controllers: [AiController],
  providers: [AiService, BrandVoiceService],
  exports: [BrandVoiceService]
})
export class AiModule {}
