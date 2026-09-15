import { InferenceClient } from '@huggingface/inference'

const QUESTION_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'rma_interview_question',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        done: { type: 'boolean' },
        questionNumber: { type: 'integer', minimum: 1, maximum: 17 },
        focus: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['question', 'done', 'questionNumber', 'focus', 'reason'],
      additionalProperties: false,
    },
  },
} as const

export async function askHF(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN is missing on the server.')

  const hf = new InferenceClient(token)
  // Lighter/faster model. Override with HF_MODEL in Vercel if desired.
  const model = process.env.HF_MODEL || 'Qwen/Qwen3-8B'

  const result = await hf.chatCompletion({
    model,
    messages,
    max_tokens: 300,
    temperature: 0.25,
    provider: 'auto',
    response_format: QUESTION_SCHEMA,
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
        // Fall through to the useful error below.
      }
    }
    throw new Error('The AI returned an invalid response. Please try again.')
  }
}
