/** Adapter error that must not be retried (misconfiguration or unsupported input). */
export class PermanentAdapterError extends Error {
  readonly permanent = true

  constructor(message: string) {
    super(message)
    this.name = 'PermanentAdapterError'
  }
}
