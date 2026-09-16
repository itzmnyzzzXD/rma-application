import { InferenceClient } from '@huggingface/inference'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function askHF(messages: ChatMessage[]) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN is missing on the server.')

  const hf = new InferenceClient(token)

  // Use a small model that is currently listed with Hugging Face Inference
  // Provider support. Keep this fixed so an old Vercel HF_MODEL variable
  // cannot accidentally select an unavailable model.
  const models = [
    'Qwen/Qwen2.5-1.5B-Instruct',
    'Qwen/Qwen2.5-3B-Instruct',
  ]

  let lastError: unknown = null

  for (const model of models) {
    try {
      const result = await hf.chatCompletion({
        model,
        messages,
        max_tokens: 160,
        temperature: 0.1,
        provider: 'auto',
      })

      const content = result.choices?.[0]?.message?.content?.trim()
      if (content) return content
    } catch (error) {
      lastError = error
      console.error(`HF model ${model} failed:`, error)
    }
  }

  throw new Error(
    `Hugging Face inference failed. ${lastError instanceof Error ? lastError.message : 'No available model provider.'}`,
  )
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
        // Continue below.
      }
    }

    throw new Error('The AI returned an invalid response. Please try again.')
  }
}
