import { PermanentAdapterError } from './errors'

/**
 * YouTube Data API accepts video binaries only (resumable upload). Text-only
 * posts are impossible; wire this adapter to the S3 media pipeline in P9.
 */
export async function publishYouTube(): Promise<never> {
  throw new PermanentAdapterError(
    'YouTube требует загрузку видеофайла через resumable upload — текстовые посты API не поддерживаются'
  )
}
