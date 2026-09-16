type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const API_URL = 'https://router.huggingface.co/v1/chat/completions'
const MODEL = 'openai/gpt-oss-120b:fastest'

export async function askHF(messages: ChatMessage[]) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN is missing on the server.')

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 300,
      stream: false,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const providerError =
      data?.error?.message ??
      data?.error ??
      data?.message ??
      `HTTP ${response.status}`

    throw new Error(
      `Hugging Face ${response.status}: ${typeof providerError === 'string' ? providerError : JSON.stringify(providerError)}`,
    )
  }

  const content = data?.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('Hugging Face returned an empty response.')
  }

  return content
}
