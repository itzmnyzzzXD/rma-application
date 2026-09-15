import { NextResponse } from 'next/server'
import { SYSTEM_PROMPT } from '@/lib/prompts'
import { askHF, extractJson } from '@/lib/hf'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const transcript = Array.isArray(body.transcript) ? body.transcript : []
    const answerCount = transcript.filter((m: any) => m?.role === 'candidate').length

    if (answerCount >= 17) {
      return NextResponse.json({ done: true })
    }

    // Guarantee the first question is always the Discord username prompt.
    if (answerCount === 0) {
      return NextResponse.json({
        question: "What’s your Discord username?",
        done: false,
        questionNumber: 1,
        focus: 'identity',
      })
    }

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...transcript.slice(-40).map((m: any) => ({
        role: m.role === 'candidate' ? 'user' as const : 'assistant' as const,
        content: String(m.content ?? ''),
      })),
      {
        role: 'user' as const,
        content: `There have been ${answerCount} applicant answers so far. Generate the next single question.`,
      },
    ]

    const raw = await askHF(messages)
    const parsed = extractJson(raw)

    if (typeof parsed.question !== 'string') throw new Error('Invalid question response.')

    return NextResponse.json({
      question: parsed.question,
      done: Boolean(parsed.done && answerCount >= 10),
      questionNumber: Math.min(answerCount + 1, 17),
      focus: parsed.focus || 'general',
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI request failed.' }, { status: 500 })
  }
}
