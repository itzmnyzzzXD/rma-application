import { NextResponse } from 'next/server'
import { STAFF_SUMMARY_PROMPT, SUMMARY_PROMPT } from '@/lib/prompts'
import { askHF, extractJson } from '@/lib/hf'

export const runtime = 'nodejs'

function clampText(value: unknown, max = 1000) {
  return String(value ?? '').slice(0, max)
}

function cleanList(value: unknown, max = 6) {
  return Array.isArray(value)
    ? value.map(item => clampText(item, 180)).filter(Boolean).slice(0, max)
    : []
}

function fallbackSummary(type: 'player' | 'staff', transcript: Array<{ role: string; content: string }>) {
  const candidateMessages = transcript.filter(m => m.role === 'candidate').map(m => m.content)
  const first = candidateMessages[0] || 'Unknown'
  const joined = candidateMessages.join(' ')
  const position = candidateMessages.find(a => /\b(ST|LW|RW|CAM|CM|CDM|LB|RB|CB|GK)\b/i.test(a)) || 'Not stated'

  return {
    candidate: first,
    position: type === 'player' ? position : undefined,
    role: type === 'staff' ? 'Not stated' : undefined,
    experience: candidateMessages[3] || 'Not stated',
    activity: candidateMessages[5] || 'Not stated',
    strengths: [],
    concerns: ['AI summary unavailable; transcript requires manual review.'],
    evidence: joined ? [clampText(joined, 500)] : [],
    followUp: [],
    recommendation: 'REVIEW',
  }
}

async function postWebhook(webhook: string, payload: unknown, wait = false) {
  const url = wait ? `${webhook}${webhook.includes('?') ? '&' : '?'}wait=true` : webhook

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })

      if (response.ok) return true

      const detail = await response.text()
      console.error(`Discord webhook attempt ${attempt + 1} failed:`, detail)

      if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
        const retryAfter = Number(response.headers.get('retry-after') || '1')
        await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(retryAfter * 1000, 500), 5000)))
        continue
      }

      return false
    } catch (error) {
      console.error(`Discord webhook attempt ${attempt + 1} threw:`, error)
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500))
        continue
      }
      return false
    }
  }

  return false
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const transcript = Array.isArray(body.transcript) ? body.transcript : []
    const startedAt = body.startedAt || new Date().toISOString()
    const type: 'player' | 'staff' = body.applicationType === 'staff' ? 'staff' : 'player'
    const candidateAnswerCount = transcript.filter((m: any) => m?.role === 'candidate').length
    const minimumAnswers = type === 'staff' ? 8 : 10

    if (candidateAnswerCount < minimumAnswers) {
      return NextResponse.json({ error: `The ${type} interview needs at least ${minimumAnswers} applicant answers.` }, { status: 400 })
    }

    const cleanTranscript = transcript.slice(0, 60).map((m: any) => ({
      role: m.role === 'candidate' ? 'candidate' : 'interviewer',
      content: clampText(m.content, 1200),
    }))

    let summary: any
    try {
      const summaryRaw = await askHF([
        { role: 'system', content: type === 'staff' ? STAFF_SUMMARY_PROMPT : SUMMARY_PROMPT },
        { role: 'user', content: JSON.stringify(cleanTranscript) },
      ])
      summary = extractJson(summaryRaw)
    } catch (summaryError) {
      console.error('AI summary failed; using safe fallback summary:', summaryError)
      summary = fallbackSummary(type, cleanTranscript)
    }

    const webhook = process.env.DISCORD_WEBHOOK_URL
    if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is missing on the server.')
    if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(webhook)) {
      throw new Error('DISCORD_WEBHOOK_URL is invalid.')
    }

    const candidate = clampText(summary.candidate || candidateAnswerCount ? cleanTranscript.find(m => m.role === 'candidate')?.content : 'Unknown Candidate', 100)
    const strengths = cleanList(summary.strengths)
    const concerns = cleanList(summary.concerns)
    const evidence = cleanList(summary.evidence)
    const roleOrPosition = type === 'staff' ? summary.role : summary.position
    const routing = clampText(summary.recommendation || 'REVIEW', 40)

    const transcriptText = cleanTranscript
      .map((m: any, i: number) => `**${m.role === 'candidate' ? 'Applicant' : 'RMA AI'} ${i + 1}:** ${m.content}`)
      .join('\n\n')

    const summaryPayload = {
      username: 'RMA Recruiter',
      embeds: [
        {
          title: `${type === 'staff' ? 'RMA Staff Application' : 'RMA Player Application'} • ${candidate}`,
          description: `**Status:** 🟡 PENDING HUMAN REVIEW\n**AI routing:** ${routing}`,
          color: type === 'staff' ? 0x7c3aed : 0xD9B300,
          fields: [
            { name: 'Discord', value: `\`${candidate}\``, inline: true },
            { name: type === 'staff' ? 'Desired role' : 'Position', value: clampText(roleOrPosition || 'Unknown', 120), inline: true },
            { name: 'Experience', value: clampText(summary.experience || 'Not stated', 700), inline: false },
            { name: 'Activity', value: clampText(summary.activity || 'Not stated', 500), inline: false },
            { name: 'Strengths', value: strengths.length ? strengths.map(x => `• ${x}`).join('\n') : 'None captured', inline: false },
            { name: 'Concerns', value: concerns.length ? concerns.map(x => `• ${x}`).join('\n') : 'None captured', inline: false },
            { name: 'Evidence', value: evidence.length ? evidence.map(x => `• ${x}`).join('\n') : 'No evidence extracted', inline: false },
            { name: 'Interview started', value: clampText(startedAt, 80), inline: true },
          ],
          footer: { text: `${process.env.CLUB_NAME || 'RMA — Real Madrid Association'} • ${type === 'staff' ? 'Staff' : 'Player'}` },
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: [] },
    }

    const summarySent = await postWebhook(webhook, summaryPayload, true)
    if (!summarySent) return NextResponse.json({ error: 'Discord webhook failed.' }, { status: 502 })

    const chunks: string[] = []
    for (let i = 0; i < transcriptText.length; i += 1800) chunks.push(transcriptText.slice(i, i + 1800))

    for (let i = 0; i < chunks.length; i++) {
      const sent = await postWebhook(webhook, {
        username: 'RMA Recruiter',
        content: `${i === 0 ? `**📄 FULL ${type === 'staff' ? 'STAFF' : 'PLAYER'} INTERVIEW TRANSCRIPT**\n` : ''}${chunks[i]}`,
        allowed_mentions: { parse: [] },
      })
      if (!sent) return NextResponse.json({ error: 'Discord transcript delivery failed.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Submission failed.' },
      { status: 500 },
    )
  }
}
