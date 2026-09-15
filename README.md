# RMA AI Recruiter

Adaptive RMA player application built with Next.js + Hugging Face Inference Providers + Discord webhook delivery.

## What it does

- Asks for Discord username first.
- Reveals one question at a time.
- Uses the applicant's answers to adapt follow-up questions.
- Targets 10–17 total applicant answers.
- Branches into position-specific football questions.
- Generates a factual recruiter summary at the end.
- Sends the transcript + summary to Discord as a structured embed.
- Keeps Hugging Face and Discord secrets server-side.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add your Hugging Face token to `HF_TOKEN`.
3. Add your Discord webhook to `DISCORD_WEBHOOK_URL`.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open the local URL shown by Next.js.

## Deploy to Vercel

Add these environment variables in the Vercel project:

- `HF_TOKEN`
- `HF_MODEL` (optional; defaults to `Qwen/Qwen3-32B`)
- `DISCORD_WEBHOOK_URL`
- `CLUB_NAME` (optional)

Do NOT put the Discord webhook or Hugging Face token in client-side code.

## Notes

The Discord webhook is treated as a secret. Rotate/recreate it if it has been publicly exposed.
