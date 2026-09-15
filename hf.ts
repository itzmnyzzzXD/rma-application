import { InferenceClient } from '@huggingface/inference'

export async function askHF(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN is missing on the server.')

  const hf = new InferenceClient(token)
  const model = process.env.HF_MODEL || 'Qwen/Qwen3-32B'

  const result = await hf.chatCompletion({
    model,
    messages,
    max_tokens: 500,
    temperature: 0.45,
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
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('Model did not return valid JSON.')
  }
}
