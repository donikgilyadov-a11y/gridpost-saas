export interface AiProvider {
  complete(prompt: string, maxTokens?: number): Promise<string>
}

/** OpenAI-compatible Chat Completions endpoint (also works with compatible gateways). */
export class OpenAiProvider implements AiProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async complete(prompt: string, maxTokens = 2000): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      })
    })
    const data = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message: string }
    }
    if (!response.ok) throw new Error(data.error?.message ?? `OpenAI HTTP ${response.status}`)
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI provider returned no content')
    return content
  }
}

/** Local Ollama generate endpoint. */
export class OllamaProvider implements AiProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false, format: 'json' })
    })
    const data = (await response.json().catch(() => ({}))) as { response?: string; error?: string }
    if (!response.ok) throw new Error(data.error ?? `Ollama HTTP ${response.status}`)
    if (!data.response) throw new Error('Ollama returned no content')
    return data.response
  }
}

/** Test seam: a local HTTP endpoint that echoes a JSON completion. */
export class MockHttpProvider implements AiProvider {
  constructor(private readonly url: string) {}

  async complete(prompt: string): Promise<string> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt })
    })
    const data = (await response.json().catch(() => ({}))) as { completion?: string }
    if (!response.ok || !data.completion) throw new Error(`AI mock HTTP ${response.status}`)
    return data.completion
  }
}

export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned) as T
}
