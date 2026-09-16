type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const API_URL = 'https://router.huggingface.co/v1/chat/completions'
const MODEL = 'openai/gpt-oss-120b:fastest'
const FALLBACK_MODEL = 'openai/gpt-oss-20b:fastest'
const REQUEST_TIMEOUT_MS = 45_000

function formatProviderError(status: number, data: unknown) {
  const error = data as {
    error?: { message?: unknown } | string
    message?: unknown
  }

  const detail =
    typeof error?.error === 'string'
      ? error.error
      : typeof error?.error?.message === 'string'
        ? error.error.message
        : typeof error?.message === 'string'
          ? error.message
          : null

  if (status === 401) {
    return 'Invalid or unauthorized HF_TOKEN. Use a fine-grained token with “Make calls to Inference Providers” permission.'
  }
  if (status === 402) return 'Hugging Face Inference Providers credits are unavailable for this account.'
  if (status === 403) return 'Hugging Face denied this inference request. Check token permissions and provider access.'
  if (status === 429) return 'Hugging Face rate limit reached. Please retry shortly.'

  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}: Hugging Face provider request failed.`
}

async function requestModel(token: string, model: string, messages: ChatMessage[]) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 300,
        stream: false,
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) throw new Error(formatProviderError(response.status, data))

    const content = data?.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('Hugging Face returned an empty response.')

    return content
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Hugging Face request timed out after 45 seconds.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function askHF(messages: ChatMessage[]) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN is missing on the server.')

  let firstError: unknown = null

  try {
    return await requestModel(token, MODEL, messages)
  } catch (error) {
    firstError = error
    console.error('HF primary model failed:', error)
  }

  try {
    return await requestModel(token, FALLBACK_MODEL, messages)
  } catch (fallbackError) {
    console.error('HF fallback model failed:', fallbackError)
    const firstMessage = firstError instanceof Error ? firstError.message : 'Primary model failed.'
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Fallback model failed.'
    throw new Error(`Hugging Face inference failed. ${firstMessage} | ${fallbackMessage}`)
  }
}

export function extractJson(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        // fall through
      }
    }
    throw new Error('The AI returned invalid JSON.')
  }
}
