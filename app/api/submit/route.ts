import { NextResponse } from 'next/server'
import { SUMMARY_PROMPT } from '@/lib/prompts'
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

function fallbackSummary(transcript: Array<{ role: string; content: string }>) {
  const candidateMessages = transcript.filter(m => m.role === 'candidate').map(m => m.content)
  const first = candidateMessages[0] || 'Unknown'
  const joined = candidateMessages.join(' ')
  const position = candidateMessages.find(a => /\b(ST|LW|RW|CAM|CM|CDM|LB|RB|CB|GK)\b/i.test(a)) || 'Not stated'

  return {
    candidate: first,
    position,
    experience: candidateMessages[3] || 'Not stated',
    activity: candidateMessages[5] || 'Not stated',
    strengths: [],
    concerns: [],
    evidence: joined ? [clampText(joined, 500)] : [],
    followUp: [],
    recommendation: 'REVIEW',
  }
}

async function postWebhook(webhook: string, payload: unknown, wait = false) {
  const url = wait ? `${webhook}?wait=true` : webhook

  for (let attempt = 0; attempt < 2; attempt++) {
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

      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      return false
    } catch (error) {
      console.error(`Discord webhook attempt ${attempt + 1} threw:`, error)
      if (attempt === 0) {
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
    const candidateAnswerCount = transcript.filter((m: any) => m?.role === 'candidate').length

    if (candidateAnswerCount < 10) {
      return NextResponse.json({ error: 'The interview needs at least 10 applicant answers.' }, { status: 400 })
    }

    const cleanTranscript = transcript.slice(0, 60).map((m: any) => ({
      role: m.role === 'candidate' ? 'candidate' : 'interviewer',
      content: clampText(m.content, 1200),
    }))

    let summary: any
    try {
      const summaryRaw = await askHF([
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: JSON.stringify(cleanTranscript) },
      ])
      summary = extractJson(summaryRaw)
    } catch (summaryError) {
      console.error('AI summary failed; using safe fallback summary:', summaryError)
      summary = fallbackSummary(cleanTranscript)
    }

    const webhook = process.env.DISCORD_WEBHOOK_URL
    if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is missing on the server.')
    if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(webhook)) {
      throw new Error('DISCORD_WEBHOOK_URL is invalid.')
    }

    const title = `RMA Application • ${clampText(summary.candidate || 'Unknown Candidate', 100)}`
    const strengths = cleanList(summary.strengths)
    const concerns = cleanList(summary.concerns)
    const evidence = cleanList(summary.evidence)

    const transcriptText = cleanTranscript
      .map((m: any, i: number) => `**${m.role === 'candidate' ? 'Candidate' : 'RMA AI'} ${i + 1}:** ${m.content}`)
      .join('\n\n')

    const summaryPayload = {
      username: 'RMA Recruiter',
      embeds: [
        {
          title,
          description: `**Status:** 🟡 PENDING HUMAN REVIEW\n**AI routing:** ${clampText(summary.recommendation || 'REVIEW', 40)}`,
          color: 0xD9B300,
          fields: [
            { name: 'Discord', value: `\`${clampText(summary.candidate || 'Unknown', 100)}\``, inline: true },
            { name: 'Position', value: clampText(summary.position || 'Unknown', 120), inline: true },
            { name: 'Experience', value: clampText(summary.experience || 'Not stated', 700), inline: false },
            { name: 'Activity', value: clampText(summary.activity || 'Not stated', 500), inline: false },
            { name: 'Strengths', value: strengths.length ? strengths.map(x => `• ${x}`).join('\n') : 'None captured', inline: false },
            { name: 'Concerns', value: concerns.length ? concerns.map(x => `• ${x}`).join('\n') : 'None captured', inline: false },
            { name: 'Evidence', value: evidence.length ? evidence.map(x => `• ${x}`).join('\n') : 'No evidence extracted', inline: false },
            { name: 'Interview started', value: clampText(startedAt, 80), inline: true },
          ],
          footer: { text: process.env.CLUB_NAME || 'RMA — Real Madrid Association' },
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: [] },
    }

    const summarySent = await postWebhook(webhook, summaryPayload, true)
    if (!summarySent) return NextResponse.json({ error: 'Discord webhook failed.' }, { status: 502 })

    const chunks: string[] = []
    for (let i = 0; i < transcriptText.length; i += 1800) {
      chunks.push(transcriptText.slice(i, i + 1800))
    }

    for (let i = 0; i < chunks.length; i++) {
      const sent = await postWebhook(webhook, {
        username: 'RMA Recruiter',
        content: `${i === 0 ? '**📄 FULL INTERVIEW TRANSCRIPT**\n' : ''}${chunks[i]}`,
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
