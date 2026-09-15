import { NextResponse } from 'next/server'
import { SUMMARY_PROMPT } from '@/lib/prompts'
import { askHF, extractJson } from '@/lib/hf'

export const runtime = 'nodejs'

function clampText(value: unknown, max = 1000) {
  return String(value ?? '').slice(0, max)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const transcript = Array.isArray(body.transcript) ? body.transcript : []
    const startedAt = body.startedAt || new Date().toISOString()

    if (transcript.length < 10) {
      return NextResponse.json({ error: 'The interview needs at least 10 applicant answers.' }, { status: 400 })
    }

    const cleanTranscript = transcript.slice(0, 40).map((m: any) => ({
      role: m.role === 'candidate' ? 'candidate' : 'interviewer',
      content: clampText(m.content, 1200),
    }))

    const summaryRaw = await askHF([
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: JSON.stringify(cleanTranscript) },
    ])
    const summary = extractJson(summaryRaw)

    const webhook = process.env.DISCORD_WEBHOOK_URL
    if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is missing on the server.')

    const title = `RMA Application • ${clampText(summary.candidate || 'Unknown Candidate', 100)}`
    const strengths = Array.isArray(summary.strengths) ? summary.strengths.slice(0, 6) : []
    const concerns = Array.isArray(summary.concerns) ? summary.concerns.slice(0, 6) : []
    const evidence = Array.isArray(summary.evidence) ? summary.evidence.slice(0, 6) : []

    const transcriptText = cleanTranscript
      .map((m: any, i: number) => `**${m.role === 'candidate' ? 'Candidate' : 'RMA AI'} ${i + 1}:** ${m.content}`)
      .join('\n\n')

    const summaryPayload = {
      username: 'RMA Recruiter',
      embeds: [
        {
          title,
          description: `**Status:** 🟡 PENDING HUMAN REVIEW\n**AI routing:** ${clampText(summary.recommendation || 'REVIEW', 40)}` ,
          color: 0xD9B300,
          fields: [
            { name: 'Discord', value: `\`${clampText(summary.candidate || 'Unknown', 100)}\``, inline: true },
            { name: 'Position', value: clampText(summary.position || 'Unknown', 120), inline: true },
            { name: 'Experience', value: clampText(summary.experience || 'Not stated', 700), inline: false },
            { name: 'Activity', value: clampText(summary.activity || 'Not stated', 500), inline: false },
            { name: 'Strengths', value: strengths.length ? strengths.map((x: string) => `• ${clampText(x, 180)}`).join('\n') : 'None captured', inline: false },
            { name: 'Concerns', value: concerns.length ? concerns.map((x: string) => `• ${clampText(x, 180)}`).join('\n') : 'None captured', inline: false },
            { name: 'Evidence', value: evidence.length ? evidence.map((x: string) => `• ${clampText(x, 180)}`).join('\n') : 'No evidence extracted', inline: false },
          ],
          footer: { text: process.env.CLUB_NAME || 'RMA — Real Madrid Association' },
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: [] },
    }

    const discordResponse = await fetch(`${webhook}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summaryPayload),
    })

    if (!discordResponse.ok) {
      const detail = await discordResponse.text()
      console.error('Discord webhook failed:', detail)
      return NextResponse.json({ error: 'Discord webhook failed.' }, { status: 502 })
    }

    // Discord content is limited, so send the complete transcript in safe-sized chunks.
    const chunks: string[] = []
    for (let i = 0; i < transcriptText.length; i += 1800) chunks.push(transcriptText.slice(i, i + 1800))
    for (let i = 0; i < chunks.length; i++) {
      const chunkResponse = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'RMA Recruiter',
          content: `${i === 0 ? '**📄 FULL INTERVIEW TRANSCRIPT**\n' : ''}${chunks[i]}` ,
          allowed_mentions: { parse: [] },
        }),
      })
      if (!chunkResponse.ok) {
        const detail = await chunkResponse.text()
        console.error('Discord transcript chunk failed:', detail)
        return NextResponse.json({ error: 'Discord transcript delivery failed.' }, { status: 502 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Submission failed.' }, { status: 500 })
  }
}
