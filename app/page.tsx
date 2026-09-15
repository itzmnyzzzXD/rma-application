'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Check, Loader2, ShieldCheck, Sparkles, Trophy, X } from 'lucide-react'

type Message = { role: 'interviewer' | 'candidate'; content: string }

const starter: Message[] = []

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(starter)
  const [input, setInput] = useState('')
  const [startedAt] = useState(() => new Date().toISOString())
  const [loading, setLoading] = useState(false)
  const [finished, setFinished] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const answerCount = useMemo(() => messages.filter(m => m.role === 'candidate').length, [messages])
  const progress = Math.min(100, Math.max(5, (answerCount / 10) * 100))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function getFirstQuestion() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: [] }) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Could not start interview.')
      setMessages([{ role: 'interviewer', content: data.question }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start interview.')
    } finally { setLoading(false) }
  }

  useEffect(() => { getFirstQuestion() }, [])

  async function submitAnswer() {
    const value = input.trim()
    if (!value || loading || finished) return
    const next: Message[] = [...messages, { role: 'candidate', content: value }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: next }) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'AI request failed.')
      if (data.done) {
        setFinished(true)
      } else {
        setMessages(prev => [...prev, { role: 'interviewer', content: data.question }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed.')
    } finally { setLoading(false) }
  }

  async function finishApplication() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: messages, startedAt }) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Could not send application.')
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send application.')
    } finally { setLoading(false) }
  }

  return (
    <main className="shell">
      <div className="ambient ambientA" /><div className="ambient ambientB" />
      <section className="app-card">
        <header className="topbar">
          <div className="brand"><div className="crest"><Trophy size={17}/></div><div><b>RMA</b><span>AI RECRUITMENT</span></div></div>
          <div className="status"><span className="dot"/> LIVE INTERVIEW</div>
        </header>

        <div className="hero">
          <div className="eyebrow"><Sparkles size={14}/> ADAPTIVE PLAYER SCREENING</div>
          <h1>Earn your place.</h1>
          <p>This isn’t a form dump. RMA’s interviewer adapts to your position, experience, and answers.</p>
          <div className="privacy"><ShieldCheck size={15}/> Your application is only submitted to RMA after you finish.</div>
        </div>

        <div className="meter"><div><span>Interview progress</span><strong>{Math.min(answerCount,17)} / 10–17 answers</strong></div><div className="bar"><i style={{width:`${progress}%`}}/></div></div>

        <div className="chat">
          {messages.map((m, i) => <div key={i} className={`bubbleRow ${m.role}`}><div className="avatar">{m.role === 'interviewer' ? 'R' : 'YOU'}</div><div className="bubble"><span className="bubbleLabel">{m.role === 'interviewer' ? 'RMA AI' : 'YOU'}</span>{m.content}</div></div>)}
          {loading && <div className="bubbleRow interviewer"><div className="avatar">R</div><div className="bubble typing"><Loader2 size={15} className="spin"/> Thinking…</div></div>}
          <div ref={bottomRef}/>
        </div>

        {error && <div className="error"><X size={15}/>{error}</div>}

        {finished && !sent ? (
          <div className="finish"><div><Check size={18}/><span><b>Interview complete.</b><small>RMA has enough information to review your application.</small></span></div><button onClick={finishApplication} disabled={loading}>Send application <ArrowUp size={17}/></button></div>
        ) : sent ? (
          <div className="success"><Check size={24}/><div><b>Application sent.</b><span>RMA has received your transcript and AI summary.</span></div></div>
        ) : (
          <div className="composer"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitAnswer()}} placeholder={loading ? 'RMA AI is thinking…' : 'Type your answer…'} disabled={loading || messages.length === 0}/><button onClick={submitAnswer} disabled={loading || !input.trim()} aria-label="Send"><ArrowUp size={18}/></button></div>
        )}
        <footer>RMA recruitment • human review decides the final outcome</footer>
      </section>
    </main>
  )
}
