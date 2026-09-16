import { InferenceClient } from '@huggingface/inference'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function askHF(messages: ChatMessage[]) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN is missing on the server.')

  const hf = new InferenceClient(token)

  // Tiny model with current Hugging Face provider availability.
  // The app no longer requires the model to produce JSON.
  const models = [
    'google/gemma-3-1b-it',
    'Qwen/Qwen3-4B',
  ]

  let lastError: unknown = null

  for (const model of models) {
    try {
      const result = await hf.chatCompletion({
        model,
        messages,
        max_tokens: 100,
        temperature: 0.2,
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
    `Hugging Face provider failed. ${lastError instanceof Error ? lastError.message : 'No available provider.'}`,
  )
}
