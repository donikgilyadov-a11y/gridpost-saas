export interface PublishRequest {
  token: string
  chatId: string
  thread: string[]
}

export interface PublishOutcome {
  remoteId: string
  url?: string
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function toTelegramHtml(text: string): string {
  let out = escapeHtml(text)
  out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  out = out.replace(/(^|\s)\*(?!\s)(.+?)(?<!\s)\*/g, '$1<i>$2</i>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
  return out
}

async function call(token: string, method: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${process.env.TELEGRAM_API ?? 'https://api.telegram.org'}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: any }
  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram API HTTP ${response.status}`)
  }
  return data.result
}

function postUrl(chatId: string, messageId: number): string | undefined {
  if (chatId.startsWith('@')) return `https://t.me/${chatId.slice(1)}/${messageId}`
  if (/^-100\d+$/.test(chatId)) return `https://t.me/c/${chatId.slice(4)}/${messageId}`
  return undefined
}

export async function publishTelegram(request: PublishRequest): Promise<PublishOutcome> {
  let replyTo: number | undefined
  let firstId: number | undefined

  for (const text of request.thread) {
    const result = await call(request.token, 'sendMessage', {
      chat_id: request.chatId,
      text: toTelegramHtml(text),
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {})
    })
    const messageId = Number(result.message_id)
    if (!firstId) firstId = messageId
    replyTo = messageId
  }

  if (!firstId) throw new Error('Telegram вернул пустой ответ')
  return { remoteId: String(firstId), url: postUrl(request.chatId, firstId) }
}
