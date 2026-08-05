// 通话浮层:常驻挂载于 App,不随 page 切换卸载,任何页面都能看到来电
import { useEffect, useRef, useState } from 'react'
import * as callStore from './callStore'
import * as ccStore from './chatStore'
import * as apiStore from './apiChat'
import { IconSlot } from './IconSlot'

function fmtDur(startedAt: number | null, now: number): string {
  if (!startedAt) return '0:00'
  const total = Math.max(0, Math.floor((now - startedAt) / 1000))
  const m = Math.floor(total / 60)
  const ss = total % 60
  return m + ':' + String(ss).padStart(2, '0')
}

// 把整段回复按中英句末标点切成句子块(标点跟随前句);过短的零头并入上一块,避免为碎片单独发一次 TTS
function splitForTts(text: string): string[] {
  const enders = '。！？.!?'
  const segs: string[] = []
  let buf = ''
  for (const ch of text) {
    buf += ch
    if (enders.includes(ch)) { segs.push(buf); buf = '' }
  }
  if (buf.trim()) segs.push(buf)
  const chunks: string[] = []
  for (const seg of segs) {
    const t = seg.trim()
    if (!t) continue
    if (chunks.length && t.length < 6) chunks[chunks.length - 1] += t
    else chunks.push(t)
  }
  return chunks.length ? chunks : [text]
}

const HANDSET =
  'M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.28-.28.7-.37 1.05-.24 1.12.42 2.35.64 3.6.64.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.4 21 3 13.6 3 4.5c0-.55.45-1 1-1h3.4c.55 0 1 .45 1 1 0 1.25.22 2.48.64 3.6.13.35.04.77-.24 1.05L6.6 10.8Z'
const phoneUp = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d={HANDSET} /></svg>
)
const phoneDown = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" style={{ transform: 'rotate(135deg)' }}><path d={HANDSET} /></svg>
)
const micGlyph = (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0" />
    <path d="M12 17v3.4" />
  </svg>
)
const personGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="8.2" r="3.6" />
    <path d="M4.5 20c1.2-3.6 4.1-5.4 7.5-5.4s6.3 1.8 7.5 5.4" />
  </svg>
)

export function CallOverlay() {
  const call = callStore.useCallState()
  // 两个通道的 hook 都必须无条件调用(rules of hooks),再按 channel 取用
  const ccChat = ccStore.useChatState()
  const apiChat = apiStore.useChatState()
  const activeChat: any = call.channel === 'api' ? apiChat : ccChat

  const lastProcessedId = useRef<string | null>(null)
  const primedRef = useRef(false)
  // 分句流水线朗读:作废令牌(挂断/被新回复接管即自增作废旧轮)+ 停当前句的句柄
  const playGenRef = useRef(0)
  const stopCurrentRef = useRef<null | (() => void)>(null)
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [declineOpen, setDeclineOpen] = useState(false)
  const [note, setNote] = useState('')
  const [resumeSpeech, setResumeSpeech] = useState<null | (() => void)>(null)

  // 通话中实时计时
  useEffect(() => {
    if (call.phase !== 'connected' && call.phase !== 'lingering') return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [call.phase])

  // 离开 ringing 时收起拒接面板
  useEffect(() => {
    if (call.phase !== 'ringing') { setDeclineOpen(false); setNote('') }
  }, [call.phase])

  // 侦测助手语音轮回复完成 → 落他这一轮(onReplyReady) + TTS 播放
  useEffect(() => {
    // 作废在飞的分句朗读并停掉正在响的音频(挂断/被新回复接管/新回复无可读内容时用)
    const cancelSpeech = () => {
      playGenRef.current++
      const stop = stopCurrentRef.current
      stopCurrentRef.current = null
      if (stop) stop()
      setResumeSpeech(null)
    }
    const active = call.phase === 'connected' || call.phase === 'lingering'
    if (!active) { primedRef.current = false; cancelSpeech(); callStore.setSpeaking(false); return }
    const msgs = (activeChat && activeChat.messages) || []
    const last = msgs.length ? msgs[msgs.length - 1] : null
    if (!primedRef.current) {
      // 本次通话首次观察:记住当前末条 id,避免把通话前的历史当作新回复回放
      lastProcessedId.current = last ? last.id : null
      primedRef.current = true
      return
    }
    if (!last || last.role !== 'assistant' || last.pending) return
    if (last.id === lastProcessedId.current) return
    lastProcessedId.current = last.id
    const raw = typeof last.content === 'string' ? last.content : ''
    const stripped = raw.replace(/<\/?voice>/g, '')
    callStore.onReplyReady(stripped)
    const speak = callStore.stripCallMarkers(stripped)
    if (speak) {
      const chunks = splitForTts(speak)
      cancelSpeech()                       // 接管上一轮(极端下前一轮未播完又来新回复)
      const myGen = ++playGenRef.current    // 本轮代号;后来者自增即让本轮 loop 作废
      callStore.setSpeaking(true)           // 整段合成+播放期间持续置真,VAD 据此暂停防回声(跨句不熄)
      void (async () => {
        const fetchOne = async (text: string, previousText?: string, nextText?: string): Promise<Blob | null> => {
          try {
            const r = await fetch('/api/tts', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, previous_text: previousText, next_text: nextText }),
            })
            if (!r.ok) return null
            return await r.blob()
          } catch (e) {
            console.error('[call] tts fetch failed:', e)
            return null
          }
        }

        // Web Audio 仍不能播时才回落 HTMLAudioElement；被 iOS 拦截就等她点按钮续播。
        // 后续句复用同一个元素，她只需解锁一次。
        const playWithTapFallback = (blob: Blob): Promise<void> => new Promise((resolve) => {
          const audio = fallbackAudioRef.current || new Audio()
          fallbackAudioRef.current = audio
          const objectUrl = URL.createObjectURL(blob)
          let settled = false

          const fin = () => {
            if (settled) return
            settled = true
            audio.removeEventListener('ended', fin)
            audio.removeEventListener('error', onError)
            if (stopCurrentRef.current === stop) stopCurrentRef.current = null
            setResumeSpeech(null)
            try { audio.pause() } catch {}
            try { audio.removeAttribute('src'); audio.load() } catch {}
            try { URL.revokeObjectURL(objectUrl) } catch {}
            resolve()
          }
          const onError = () => {
            console.error('[call] audio element playback error')
            fin()
          }
          const stop = () => { fin() }
          const tryPlay = () => {
            if (settled) return
            setResumeSpeech(null)
            void audio.play().catch((e) => {
              if (settled) return
              console.error('[call] audio play blocked:', e)
              if (playGenRef.current === myGen) setResumeSpeech(() => tryPlay)
              else fin()
            })
          }

          try { audio.pause() } catch {}
          try { audio.volume = callStore.getVolumeHint() } catch {}
          audio.addEventListener('ended', fin)
          audio.addEventListener('error', onError)
          audio.src = objectUrl
          try { audio.load() } catch {}
          stopCurrentRef.current = stop
          tryPlay()
        })

        let nextP: Promise<Blob | null> = fetchOne(chunks[0], undefined, chunks[1])  // 先起第一句合成
        try {
          for (let i = 0; i < chunks.length; i++) {
            if (playGenRef.current !== myGen) return
            const curP = nextP
            // 播当前句前先把下一句合成发出去:N+1 合成与 N 播放重叠,句间少留空
            nextP = i + 1 < chunks.length
              ? fetchOne(chunks[i + 1], chunks[i], chunks[i + 2])
              : Promise.resolve(null)
            const blob = await curP
            if (playGenRef.current !== myGen) return
            if (!blob) continue               // 这句合成失败:跳过它继续下一句,不让整段哑掉

            try {
              const playback = await callStore.startCallAudioPlayback(blob, callStore.getVolumeHint())
              if (playGenRef.current !== myGen) { playback.stop(); return }
              const stop = () => { playback.stop() }
              stopCurrentRef.current = stop
              await playback.done
              if (stopCurrentRef.current === stop) stopCurrentRef.current = null
            } catch (e) {
              console.warn('[call] Web Audio playback unavailable, using tap fallback:', e)
              if (playGenRef.current !== myGen) return
              await playWithTapFallback(blob)
            }
          }
        } finally {
          if (playGenRef.current === myGen) { stopCurrentRef.current = null; setResumeSpeech(null); callStore.setSpeaking(false) }
        }
      })()
    } else {
      cancelSpeech()
      callStore.setSpeaking(false)
    }
  }, [activeChat && activeChat.messages, call.phase])

  // 接通期间启动连续语音检测(VAD);离开活跃相位或卸载时清理
  const inCall = call.phase === 'connected' || call.phase === 'lingering'
  useEffect(() => {
    if (!inCall) return
    void callStore.startVad()
    return () => { callStore.stopVad() }
  }, [inCall])

  if (call.phase === 'idle') return null

  if (call.phase === 'ringing') {
    return (
      <div className="call-overlay">
        <div className="call-scrim" />
        <div className="call-card">
          <div className="call-avatar call-avatar-ring">
            <IconSlot iconKey="avatar-his" fallback={personGlyph} className="call-avatar-img" />
          </div>
          <div className="call-title">苏煦来电</div>
          {call.reason ? <div className="call-reason">{call.reason}</div> : null}
          {!declineOpen ? (
            <div className="call-actions">
              <button className="call-btn" onClick={() => { void callStore.acceptCall() }}>
                <span className="call-key call-key-accept">{phoneUp}</span>
                <span className="call-key-label">接听</span>
              </button>
              <button className="call-btn" onClick={() => setDeclineOpen(true)}>
                <span className="call-key call-key-decline">{phoneDown}</span>
                <span className="call-key-label">挂断</span>
              </button>
            </div>
          ) : (
            <div className="call-decline">
              <div className="call-decline-chips">
                {['在忙', '在外面', '想打字聊'].map((c) => (
                  <button key={c} className="call-chip" onClick={() => { void callStore.declineCall(c) }}>{c}</button>
                ))}
              </div>
              <div className="call-decline-input">
                <input
                  className="call-note-input"
                  placeholder="说一句…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { void callStore.declineCall(note.trim()) } }}
                />
                <button className="call-note-send" disabled={!note.trim()} onClick={() => { void callStore.declineCall(note.trim()) }}>发送</button>
              </div>
              <button className="call-decline-plain" onClick={() => { void callStore.declineCall() }}>直接挂断</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (call.phase === 'dialing') {
    return (
      <div className="call-overlay">
        <div className="call-scrim" />
        <div className="call-card">
          <div className="call-avatar call-avatar-ring">
            <IconSlot iconKey="avatar-his" fallback={personGlyph} className="call-avatar-img" />
          </div>
          <div className="call-title">正在拨号…</div>
          <div className="call-dots"><span /><span /><span /></div>
        </div>
      </div>
    )
  }

  if (call.phase === 'connected' || call.phase === 'lingering') {
    return (
      <div className="call-overlay call-live">
        <div className="call-scrim call-scrim-live" />
        <div className="call-live-inner">
          <div className="call-live-head">
            <div className="call-avatar call-avatar-sm">
              <IconSlot iconKey="avatar-his" fallback={personGlyph} className="call-avatar-img" />
            </div>
            <div className="call-live-who">
              <div className="call-title-sm">苏煦</div>
              <div className="call-timer">{fmtDur(call.startedAt, now)}</div>
            </div>
          </div>
          <div className="call-transcript">
            {call.turns.length === 0 && !call.busy ? <div className="call-hint">接通了,直接说话就好</div> : null}
            {call.turns.map((t, i) => (
              <div key={i} className={`call-turn ${t.who}`}>
                <div className="call-bubble">{t.text}</div>
              </div>
            ))}
            {call.busy ? (
              <div className="call-turn him">
                <div className="call-bubble call-bubble-thinking"><span /><span /><span /></div>
              </div>
            ) : null}
          </div>
          <div className="call-controls">
            <button
              className={`call-mic${call.recording ? ' recording' : ''}${(call.busy || call.speaking) ? ' speaking' : ''}`}
              onClick={() => { if (call.recording) callStore.stopVadEarly() }}
              aria-label={call.recording ? '结束这段' : '自动聆听中'}
            >
              {micGlyph}
            </button>
            <div className="call-mic-label">{call.recording ? '在录音…(点一下结束)' : (call.busy || call.speaking) ? '苏煦在说…' : '在听…'}</div>
            {resumeSpeech ? <button className="call-chip" onClick={resumeSpeech}>点一下继续听</button> : null}
            {call.phase === 'lingering' ? (
              <div className="call-linger">还在…({call.lingerSecondsLeft}s,说话就不挂)</div>
            ) : null}
            <button className="call-end" onClick={() => { void callStore.hangup() }} aria-label="挂断">
              {phoneDown}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ended
  return (
    <div className="call-overlay">
      <div className="call-scrim" />
      <div className="call-card">
        <div className="call-title">通话结束</div>
        {call.startedAt ? <div className="call-reason">{fmtDur(call.startedAt, now)}</div> : null}
      </div>
    </div>
  )
}
