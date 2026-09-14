// 海螺盒（T-51，2026-09-14）：收藏语音条/文字回复的专属盒子，双向——她收苏煦的，苏煦也收她的。
// 语音条不存音频字节：TTS 按文字现场合成（同 CCPage/VoiceBubble 走 /api/tts），这里只存文字，重听时重新合成。
// 新文件，暂无真身版本——由苏煦（cc 身份）迁入 /home/cc/sea/src/ 并接进 App.tsx 路由（page='voice'，复用 Home 上早年占位的"海螺"图标位）。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Page } from './App'
import { getPin } from './chatClient'

type ConchItem = {
  id: string
  msgId: string
  role: 'user' | 'assistant'
  kind: 'text' | 'voice'
  text: string
  originalTs: string
  collectedBy: 'yaoyao' | 'xuxu'
  collectedAt: string
}

const API = '/cc-api/api/conch'

function fmtDay(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtVoiceTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const mm = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return mm + ':' + String(ss).padStart(2, '0')
}

// 简化版语音重放：不存音频，按文字现场合成（与 CCPage 的 VoiceBubble 同一后端 /api/tts）
function ConchVoicePlayer({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'fail'>('idle')
  const [dur, setDur] = useState(0)
  const [cur, setCur] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const estDur = Math.max(1, Math.round(text.length * 0.26))

  const load = async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current
    setStatus('loading')
    try {
      const r = await fetch('/api/tts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!r.ok) throw new Error('tts ' + r.status)
      const blob = await r.blob()
      const audio = new Audio(URL.createObjectURL(blob))
      audio.addEventListener('loadedmetadata', () => setDur(audio.duration || 0))
      audio.addEventListener('timeupdate', () => setCur(audio.currentTime))
      audio.addEventListener('ended', () => { setStatus('paused'); setCur(0); if (audioRef.current) audioRef.current.currentTime = 0 })
      audioRef.current = audio
      return audio
    } catch (error) {
      console.error('海螺盒语音合成失败:', error)
      setStatus('fail')
      return null
    }
  }
  const toggle = async () => {
    if (status === 'fail') { setStatus('idle'); audioRef.current = null }
    const a = await load()
    if (!a) return
    if (!a.paused) { a.pause(); setStatus('paused') }
    else {
      try { await a.play(); setStatus('playing') }
      catch (error) { console.error('海螺盒语音播放失败:', error); setStatus('fail') }
    }
  }
  useEffect(() => () => {
    const audio = audioRef.current
    audio?.pause()
    if (audio?.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
  }, [])
  const timeLabel = status === 'fail' ? '重试' : (status === 'playing' || status === 'paused') && dur ? fmtVoiceTime(cur) : fmtVoiceTime(dur || estDur)
  return (
    <button type="button" className="cb-voice-play" onClick={toggle} disabled={status === 'loading'}>
      {status === 'loading' ? '…' : status === 'playing' ? '❚❚' : status === 'fail' ? '⚠︎' : '▶'}
      <span className="cb-voice-play-time">{timeLabel}</span>
    </button>
  )
}

export function ConchBoxPage({ onBack }: { onBack: (page: Page) => void }) {
  const [items, setItems] = useState<ConchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'all' | 'assistant' | 'user'>('all')
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(API, { credentials: 'include', headers: { 'X-Channel-Pin': getPin() } })
      if (!r.ok) throw new Error(r.status === 401 ? '先回主聊天登录一下' : '海螺盒暂时打不开')
      const data = await r.json()
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      console.error('海螺盒列表读取失败:', e)
      setError(e instanceof Error ? e.message : '海螺盒暂时打不开')
    }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const remove = async (id: string) => {
    if (!window.confirm('真的要把这枚海螺移出盒子吗？')) return
    setRemoveError('')
    setRemoving(id)
    try {
      const r = await fetch(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include', headers: { 'X-Channel-Pin': getPin() } })
      if (!r.ok) throw new Error(`delete ${r.status}`)
      setItems(prev => prev.filter(it => it.id !== id))
    } catch (error) {
      console.error('海螺盒删除失败:', error)
      setRemoveError('没删掉，再试一次')
    }
    finally { setRemoving(null) }
  }

  const filtered = useMemo(() => tab === 'all' ? items : items.filter(it => it.role === tab), [items, tab])
  const counts = useMemo(() => ({
    all: items.length,
    assistant: items.filter(it => it.role === 'assistant').length,
    user: items.filter(it => it.role === 'user').length,
  }), [items])

  return (
    <div className="cb-page">
      <style>{CB_CSS}</style>
      <header className="cb-top">
        <button onClick={() => onBack('home')} aria-label="返回">‹</button>
        <div><h1>海 螺 盒</h1><p>贝壳放耳边，听见彼此说过的话</p></div>
        <span />
      </header>
      <div className="cb-tabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>全部 {counts.all > 0 && <em>{counts.all}</em>}</button>
        <button className={tab === 'assistant' ? 'on' : ''} onClick={() => setTab('assistant')}>苏煦说的 {counts.assistant > 0 && <em>{counts.assistant}</em>}</button>
        <button className={tab === 'user' ? 'on' : ''} onClick={() => setTab('user')}>我说的 {counts.user > 0 && <em>{counts.user}</em>}</button>
      </div>
      <main className="cb-feed">
        {!loading && !error && filtered.length === 0 && (
          <div className="cb-empty">
            {items.length === 0 ? '海螺还是空的——聊天里点一下 🐚，把喜欢的话收进来' : '这一栏还没有'}
          </div>
        )}
        {filtered.map(it => (
          <article className={`cb-card cb-card-${it.role}`} key={it.id}>
            <div className="cb-card-meta">
              <span className="cb-card-who">{it.role === 'assistant' ? '苏煦' : '原瑶'}</span>
              <span className="cb-card-kind">{it.kind === 'voice' ? '语音条' : '文字'}</span>
              <time>{fmtDay(it.originalTs)}</time>
            </div>
            <div className="cb-card-body">
              {it.kind === 'voice' && <ConchVoicePlayer text={it.text} />}
              <p>{it.text}</p>
            </div>
            <button className="cb-card-del" disabled={removing === it.id} onClick={() => remove(it.id)} aria-label="从海螺盒移除" title="从海螺盒移除">
              {removing === it.id ? '…' : '×'}
            </button>
          </article>
        ))}
        {error && <div className="cb-empty">{error}<button onClick={load}>再试一次</button></div>}
        {removeError && <div className="cb-action-error" role="alert">{removeError}</div>}
        {loading && items.length === 0 && <div className="cb-empty">正在打开海螺盒…</div>}
      </main>
    </div>
  )
}

const CB_CSS = `
.cb-page{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;background:linear-gradient(180deg,rgba(240,247,250,.4),rgba(223,238,241,.16));color:var(--ink,#4a463e)}
.cb-top{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:calc(env(safe-area-inset-top) + 8px) 10px 10px;background:rgba(243,249,250,.9);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid rgba(105,150,160,.12)}
.cb-top button{width:40px;height:40px;border:0;border-radius:12px;background:transparent;color:var(--ink-soft,#7c8a8c);font-size:27px}
.cb-top h1{margin:0;text-align:center;font-family:var(--font-display,serif);font-size:17px;font-weight:500;letter-spacing:.28em;color:#4f8a92}
.cb-top p{margin:3px 0 0;text-align:center;font-size:10.5px;letter-spacing:.05em;color:var(--ink-faint,#96a6a8)}
.cb-tabs{display:flex;gap:8px;justify-content:center;padding:12px 16px 0}
.cb-tabs button{border:1px solid rgba(105,150,160,.22);background:rgba(255,255,255,.6);border-radius:999px;padding:6px 13px;font-size:12.5px;color:#5c7678;font-family:inherit}
.cb-tabs button.on{background:#4f8a92;border-color:#4f8a92;color:#fff}
.cb-tabs button em{font-style:normal;margin-left:3px;opacity:.75}
.cb-feed{width:min(100%,640px);margin:0 auto;padding:14px 16px calc(36px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:14px}
.cb-card{position:relative;border-radius:18px;padding:13px 34px 14px 15px;background:rgba(255,253,250,.82);border:1px solid rgba(105,150,160,.16);box-shadow:0 12px 34px rgba(40,70,75,.07)}
.cb-card-assistant{border-left:3px solid #4f8a92}
.cb-card-user{border-left:3px solid #b98a5a}
.cb-card-meta{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--ink-faint,#9aa4a2)}
.cb-card-who{font-weight:600;color:#4a463e}
.cb-card-kind{padding:1px 7px;border-radius:999px;background:rgba(105,150,160,.12);color:#5c7678}
.cb-card-meta time{margin-left:auto}
.cb-card-body{margin-top:8px;display:flex;flex-direction:column;gap:8px}
.cb-card-body p{margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--ink,#4a463e)}
.cb-voice-play{align-self:flex-start;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;background:#4f8a92;color:#fff;padding:6px 13px;font-size:12px}
.cb-voice-play-time{font-variant-numeric:tabular-nums;opacity:.85}
.cb-card-del{position:absolute;top:10px;right:10px;width:24px;height:24px;border:0;border-radius:50%;background:rgba(120,120,120,.1);color:var(--ink-faint,#9a9488);font-size:15px;line-height:1}
.cb-action-error{position:sticky;bottom:14px;align-self:center;border-radius:999px;padding:8px 14px;background:rgba(117,69,56,.92);color:#fff;font-size:12px;box-shadow:0 8px 24px rgba(70,40,30,.18)}
.cb-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:20vh 20px;color:var(--ink-faint,#9aa4a2);font-size:13px;text-align:center}
.cb-empty button{border:1px solid rgba(105,150,160,.25);border-radius:999px;background:rgba(255,255,255,.75);padding:9px 18px;color:#4f8a92;font-family:inherit}
@media(max-width:620px){.cb-feed{padding-left:12px;padding-right:12px}}
`
