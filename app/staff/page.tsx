'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowUp, Check, Loader2, ShieldCheck, Sparkles, Trophy, X } from 'lucide-react'

type Message = { role: 'interviewer' | 'candidate'; content: string }
const APPLICATION_TYPE = 'staff' as const
const MIN_ANSWERS = 8

export default function StaffApplication() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [startedAt] = useState(() => new Date().toISOString())
  const [loading, setLoading] = useState(false)
  const [finished, setFinished] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const answerCount = useMemo(() => messages.filter(m => m.role === 'candidate').length, [messages])
  const progress = Math.min(100, Math.max(8, (answerCount / MIN_ANSWERS) * 100))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    void getFirstQuestion()
  }, [])

  async function getFirstQuestion() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: [], applicationType: APPLICATION_TYPE }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not start staff interview.')
      setMessages([{ role: 'interviewer', content: data.question }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start staff interview.')
    } finally {
      setLoading(false)
    }
  }

  async function submitAnswer() {
    const value = input.trim()
    if (!value || loading || finished) return

    const next: Message[] = [...messages, { role: 'candidate', content: value }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: next, applicationType: APPLICATION_TYPE }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI request failed.')

      if (data.done) {
        setFinished(true)
      } else {
        setMessages(previous => [...previous, { role: 'interviewer', content: data.question }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed.')
    } finally {
      setLoading(false)
    }
  }

  async function finishApplication() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: messages, startedAt, applicationType: APPLICATION_TYPE }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not send staff application.')
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send staff application.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="shell">
      <div className="ambient ambientA" />
      <div className="ambient ambientB" />
      <section className="app-card">
        <header className="topbar">
          <div className="brand">
            <div className="crest"><Trophy size={17} /></div>
            <div><b>RMA</b><span>STAFF RECRUITMENT</span></div>
          </div>
          <div className="topbar-actions">
            <Link className="nav-link" href="/">Player application</Link>
            <div className="status"><span className="dot" /> LIVE INTERVIEW</div>
          </div>
        </header>

        <div className="hero">
          <div className="eyebrow"><Sparkles size={14} /> ADAPTIVE STAFF SCREENING</div>
          <h1>Earn the role.</h1>
          <p>RMA’s staff interview focuses on judgment, communication, activity and how you handle real club situations.</p>
          <div className="privacy"><ShieldCheck size={15} /> Final staff decisions are made by RMA human staff.</div>
        </div>

        <div className="meter">
          <div><span>Staff interview progress</span><strong>{Math.min(answerCount, 12)} / 8–12 answers</strong></div>
          <div className="bar"><i style={{ width: `${progress}%` }} /></div>
        </div>

        <div className="chat">
          {messages.map((message, index) => (
            <div key={index} className={`bubbleRow ${message.role}`}>
              <div className="avatar">{message.role === 'interviewer' ? 'R' : 'YOU'}</div>
              <div className="bubble">
                <span className="bubbleLabel">{message.role === 'interviewer' ? 'RMA AI' : 'YOU'}</span>
                {message.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="bubbleRow interviewer">
              <div className="avatar">R</div>
              <div className="bubble typing"><Loader2 size={15} className="spin" /> Thinking…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="error"><X size={15} />{error}</div>}

        {finished && !sent ? (
          <div className="finish">
            <div><Check size={18} /><span><b>Staff interview complete.</b><small>RMA has enough information for human staff to review.</small></span></div>
            <button onClick={finishApplication} disabled={loading}>Send application <ArrowUp size={17} /></button>
          </div>
        ) : sent ? (
          <div className="success"><Check size={24} /><div><b>Application sent.</b><span>RMA has received your staff interview and AI summary.</span></div></div>
        ) : (
          <div className="composer">
            <input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submitAnswer() }} placeholder={loading ? 'RMA AI is thinking…' : 'Type your answer…'} disabled={loading || messages.length === 0} />
            <button onClick={() => void submitAnswer()} disabled={loading || !input.trim()} aria-label="Send"><ArrowUp size={18} /></button>
          </div>
        )}

        <footer><Link href="/" className="footer-link"><ArrowLeft size={11} /> Back to player recruitment</Link></footer>
      </section>
    </main>
  )
}
