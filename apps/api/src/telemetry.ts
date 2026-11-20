import * as Sentry from '@sentry/node'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

/** Initializes observability before Nest bootstraps. All integrations are opt-in. */
export function initTelemetry(): void {
  const dsn = process.env.SENTRY_DSN
  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.NODE_ENV ?? 'development'
    })
  }

  if (process.env.OTEL_ENABLED === 'true') {
    const sdk = new NodeSDK({
      instrumentations: [getNodeAutoInstrumentations()]
    })
    sdk.start()
    process.once('SIGTERM', () => void sdk.shutdown())
  }
}
