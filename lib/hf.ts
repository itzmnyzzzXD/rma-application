import { InferenceClient } from '@huggingface/inference'

export async function askHF(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN is missing on the server.')

  const hf = new InferenceClient(token)
  // Small, simple instruction model. This avoids relying on heavyweight
  // structured-output support from larger models/providers.
  const model = process.env.HF_MODEL || 'google/gemma-2-2b-it'

  const result = await hf.chatCompletion({
    model,
    messages,
    max_tokens: 120,
    temperature: 0.15,
    provider: 'auto',
  })

  return result.choices?.[0]?.message?.content?.trim() || ''
}

export function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
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
        // Fall through.
      }
    }
    throw new Error('The AI returned an invalid response. Please try again.')
  }
}
