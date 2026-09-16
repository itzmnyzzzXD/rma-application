import { NextResponse } from 'next/server'
import { STAFF_SYSTEM_PROMPT, SYSTEM_PROMPT } from '@/lib/prompts'
import { askHF } from '@/lib/hf'

export const runtime = 'nodejs'

const PLAYER_MIN = 10
const PLAYER_MAX = 17
const STAFF_MIN = 8
const STAFF_MAX = 12

type ApplicationType = 'player' | 'staff'

function cleanQuestion(text: string) {
  return text
    .replace(/^```[\s\S]*?```$/g, '')
    .replace(/^\s*(question|next question)\s*:\s*/i, '')
    .replace(/^\s*["']|["']\s*$/g, '')
    .replace(/^\s*[-*]\s*/, '')
    .trim()
}

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2),
  )
}

function similarity(a: string, b: string) {
  const aa = words(a)
  const bb = words(b)
  if (!aa.size || !bb.size) return 0

  let overlap = 0
  for (const word of aa) if (bb.has(word)) overlap++
  return overlap / Math.max(aa.size, bb.size)
}

function previousQuestions(transcript: any[]) {
  return transcript
    .filter(message => message?.role === 'interviewer')
    .map(message => String(message.content ?? '').trim())
    .filter(Boolean)
}

function isTooSimilar(question: string, earlier: string[]) {
  const normalized = question.toLowerCase().replace(/\s+/g, ' ').trim()
  return earlier.some(previous => {
    const previousNormalized = previous.toLowerCase().replace(/\s+/g, ' ').trim()
    return normalized === previousNormalized || similarity(question, previous) >= 0.62
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const transcript = Array.isArray(body.transcript) ? body.transcript : []
    const type: ApplicationType = body.applicationType === 'staff' ? 'staff' : 'player'
    const answerCount = transcript.filter((m: any) => m?.role === 'candidate').length
    const minAnswers = type === 'staff' ? STAFF_MIN : PLAYER_MIN
    const maxAnswers = type === 'staff' ? STAFF_MAX : PLAYER_MAX

    if (answerCount >= maxAnswers || answerCount >= minAnswers) {
      return NextResponse.json({ done: true, questionNumber: answerCount })
    }

    if (answerCount === 0) {
      return NextResponse.json({
        question: "What’s your Discord username?",
        done: false,
        questionNumber: 1,
        focus: 'identity',
      })
    }

    const earlierQuestions = previousQuestions(transcript)
    const systemPrompt = type === 'staff' ? STAFF_SYSTEM_PROMPT : SYSTEM_PROMPT
    const banned = earlierQuestions.length
      ? `\n\nEARLIER QUESTIONS — DO NOT REPEAT OR PARAPHRASE THESE:\n${earlierQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
      : ''

    const buildMessages = (extraInstruction: string) => [
      { role: 'system' as const, content: systemPrompt + banned },
      ...transcript.slice(-40).map((m: any) => ({
        role: m.role === 'candidate' ? 'user' as const : 'assistant' as const,
        content: String(m.content ?? '').slice(0, 2000),
      })),
      {
        role: 'user' as const,
        content: `Ask exactly ONE short next ${type} interview question. Base it on the applicant’s previous answers and choose a new information target that has not already been covered. ${extraInstruction} Reply with ONLY the question text. No JSON, no explanation, no labels.`,
      },
    ]

    let question = cleanQuestion(await askHF(buildMessages('Do not repeat, rephrase, or closely resemble any earlier interviewer question.')))

    if (!question || question.length < 4) {
      throw new Error('The AI returned an empty question.')
    }

    if (isTooSimilar(question, earlierQuestions)) {
      question = cleanQuestion(await askHF(buildMessages('Your first draft was too similar to an earlier question. Generate a completely different question that tests a different area.')))
    }

    if (!question || question.length < 4 || isTooSimilar(question, earlierQuestions)) {
      throw new Error('The AI could not generate a sufficiently different interview question.')
    }

    return NextResponse.json({
      question,
      done: false,
      questionNumber: answerCount + 1,
      focus: type === 'staff' ? 'staff-adaptive' : 'player-adaptive',
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI request failed.' },
      { status: 500 },
    )
  }
}
