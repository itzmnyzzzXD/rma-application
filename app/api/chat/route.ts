import { NextResponse } from 'next/server'
import { SYSTEM_PROMPT } from '@/lib/prompts'
import { askHF } from '@/lib/hf'

export const runtime = 'nodejs'

function cleanQuestion(text: string) {
  return text
    .replace(/^```[\s\S]*?```$/g, '')
    .replace(/^\s*(question|next question)\s*:\s*/i, '')
    .replace(/^\s*["']|["']\s*$/g, '')
    .trim()
}

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
      ...transcript.slice(-30).map((m: any) => ({
        role: m.role === 'candidate' ? 'user' as const : 'assistant' as const,
        content: String(m.content ?? ''),
      })),
      {
        role: 'user' as const,
        content: `Ask exactly ONE short next interview question. There have been ${answerCount} applicant answers. Reply with ONLY the question text. No JSON, no explanation, no labels.`,
      },
    ]

    const raw = await askHF(messages)
    const question = cleanQuestion(raw)

    if (!question || question.length < 4) {
      throw new Error('The AI returned an empty question.')
    }

    return NextResponse.json({
      question,
      done: answerCount >= 10 && answerCount >= 17,
      questionNumber: Math.min(answerCount + 1, 17),
      focus: 'adaptive',
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI request failed.' }, { status: 500 })
  }
}
