import { PermanentAdapterError } from './errors'

/**
 * TikTok Content Posting API requires a video/photos file and a publish_id
 * polling loop. Text-only publishing is not supported by the official API.
 */
export async function publishTikTok(): Promise<never> {
  throw new PermanentAdapterError(
    'TikTok требует видео или фото через Content Posting API — текстовые посты не поддерживаются'
  )
}
