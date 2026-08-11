import { useState, useEffect, useCallback, useRef } from 'react'
import type { Page } from './App'

interface Wave {
  id: string
  title: string
  note: string | null
  size: 'small' | 'big'
  stakes: number
  desire: number
  status: string
  version: number
  created_by_role?: string
  deadline?: string | null
  snow_awarded?: number
}
interface CatchNetItem {
  id: string
  content: string
  sorted_at: string | null
  created_at: string
}
interface LedgerEntry {
  id: string
  kind: 'assigned' | 'debt_yao' | 'debt_suxu' | 'punishment'
  content: string
  status: string
  interest_note: string | null
}
const LEDGER_LABEL: Record<string, string> = { assigned: '布置', debt_yao: '原瑶欠', debt_suxu: '苏煦欠', punishment: '惩罚' }

const API = '/tide'
const SOUND_KEY = 'sea:tide:sound'

function genId() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function tideFetch(path: string, opts: RequestInit = {}) {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    })
  } catch {
    const err = new Error('network') as Error & { network?: boolean }
    err.network = true
    throw err
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `http_${res.status}`)
  }
  return res.json()
}

// 断网本地队列:网络失败的写操作先存起来,恢复后按原 request_id 重放(服务端幂等去重)
const QUEUE_KEY = 'sea:tide:queue'
type QueuedAction = { path: string; body: Record<string, unknown>; ts: number }
function readQueue(): QueuedAction[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function writeQueue(q: QueuedAction[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50))) } catch {}
}
function enqueue(path: string, body: Record<string, unknown>) {
  writeQueue([...readQueue(), { path, body, ts: Date.now() }])
}
async function replayQueue(): Promise<boolean> {
  let q = readQueue().filter(a => Date.now() - a.ts < 7 * 24 * 3600 * 1000)
  let touched = false
  while (q.length) {
    const item = q[0]
    try {
      await tideFetch(item.path, { method: 'POST', body: JSON.stringify(item.body) })
      touched = true
    } catch (e: any) {
      if (e.network) break // 还没网,剩下的留着下次
      touched = true // 服务器有回应(哪怕拒绝)就算处理完,不再重试
    }
    q = q.slice(1)
    writeQueue(q)
  }
  writeQueue(q)
  return touched
}

// 轻的"叮"——不引外部音频文件,合成一个短促柔和的正弦音
function playChime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1318.5, ctx.currentTime)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => ctx.close()
  } catch {}
}

function WaveCard({ wave, onComplete, onCommit, onSink, busy }: {
  wave: Wave
  onComplete: (id: string) => Promise<void>
  onCommit?: (id: string) => void
  onSink?: (id: string) => void
  busy: boolean
}) {
  const [bursting, setBursting] = useState(false)
  const [shaking, setShaking] = useState(false)

  return (
    <div className={`td-card${wave.created_by_role === 'suxu' ? ' td-wave-suxu' : ''}${bursting ? ' td-burst' : ''}${shaking ? ' td-shake' : ''}`}>
      <div className="td-card-main">
        <span className={`td-size td-size-${wave.size}`}>{wave.size === 'big' ? '大浪' : '小浪'}</span>
        <span className="td-title">{wave.title}</span>
      </div>
      <div className="td-card-actions">
        {onCommit && (
          <button className="td-btn td-btn-ghost" disabled={busy} onClick={() => onCommit(wave.id)}>收进今天</button>
        )}
        {onSink && (
          <button className="td-btn td-btn-ghost" disabled={busy} onClick={() => onSink(wave.id)}>沉回海里</button>
        )}
        <button
          className="td-btn td-btn-break"
          disabled={busy}
          onClick={async () => {
            try {
              await onComplete(wave.id)
              setBursting(true)
            } catch {
              setShaking(true)
              setTimeout(() => setShaking(false), 400)
            }
          }}
        >划破</button>
      </div>
    </div>
  )
}

function TagForm({ initial, onCancel, onSubmit }: {
  initial: { size: 'small' | 'big'; stakes: number; desire: number }
  onCancel: () => void
  onSubmit: (v: { size: 'small' | 'big'; stakes: number; desire: number; deadline?: string }) => void
}) {
  const [size, setSize] = useState<'small' | 'big'>(initial.size)
  const [stakes, setStakes] = useState(initial.stakes)
  const [desire, setDesire] = useState(initial.desire)
  const [deadline, setDeadline] = useState('')
  return (
    <div className="td-tag-form">
      <div className="td-add-row">
        <div className="td-seg">
          <button type="button" className={size === 'small' ? 'active' : ''} onClick={() => setSize('small')}>小浪</button>
          <button type="button" className={size === 'big' ? 'active' : ''} onClick={() => setSize('big')}>大浪</button>
        </div>
      </div>
      <div className="td-add-row">
        <label className="td-slider-label">不做会怎样
          <input type="range" min={1} max={3} value={stakes} onChange={e => setStakes(Number(e.target.value))} />
        </label>
        <label className="td-slider-label">想不想做
          <input type="range" min={1} max={3} value={desire} onChange={e => setDesire(Number(e.target.value))} />
        </label>
      </div>
      <div className="td-add-row">
        <label className="td-slider-label">截止(可不填)
          <input type="date" className="td-input td-date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </label>
      </div>
      <div className="td-add-row">
        <button type="button" className="td-btn td-btn-ghost" onClick={onCancel}>取消</button>
        <button type="button" className="td-btn td-btn-break" onClick={() => onSubmit({ size, stakes, desire, deadline: deadline || undefined })}>放进海里</button>
      </div>
    </div>
  )
}

export function TidesPage({ onBack }: { onBack: (p: Page) => void }) {
  const [today, setToday] = useState<Wave[]>([])
  const [floating, setFloating] = useState<Wave[]>([])
  const [catchNet, setCatchNet] = useState<CatchNetItem[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [snow, setSnow] = useState(0)
  const [todayLevel, setTodayLevel] = useState<number | null>(null)
  const [lowTide, setLowTide] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [showCapture, setShowCapture] = useState(false)
  const [captureText, setCaptureText] = useState('')
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [showAllFloating, setShowAllFloating] = useState(false)
  const [seabed, setSeabed] = useState<Wave[] | null>(null)
  const [drawer, setDrawer] = useState<{ wave: Wave; note: string | null }[]>([])
  const [offlineNote, setOfflineNote] = useState(false)
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
  })
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    try {
      const surfaceResult = await tideFetch('/surface/recompute', { method: 'POST', body: JSON.stringify({ request_id: genId() }) })
      const [todayData, catchNetData, snowData, levelData, ledgerData, lockedData] = await Promise.all([
        tideFetch('/stats/today'),
        tideFetch('/catch-net'),
        tideFetch('/stats/snow'),
        tideFetch('/levels/today'),
        tideFetch('/ledger?status=open'),
        tideFetch('/waves?status=locked'),
      ])
      if (!mountedRef.current) return
      setFloating(surfaceResult.surfaced)
      setLowTide(surfaceResult.low_tide)
      setToday(todayData.committed)
      setCatchNet(catchNetData)
      setSnow(snowData.total)
      setTodayLevel(levelData.level)
      setLedger(ledgerData)
      setShowAllFloating(false)
      const withNotes = await Promise.all((lockedData as Wave[]).map(async (w) => {
        try {
          const detail = await tideFetch(`/waves/${w.id}`)
          return { wave: w, note: (detail.drawer_note && detail.drawer_note.note) || null }
        } catch { return { wave: w, note: null } }
      }))
      if (!mountedRef.current) return
      setDrawer(withNotes)
      setError(null)
    } catch (e: any) {
      if (mountedRef.current) setError(e.message || 'load_failed')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  const loadAllFloating = useCallback(async () => {
    try {
      const all = await tideFetch('/waves?status=floating,surfaced')
      if (mountedRef.current) setFloating(all)
    } catch (e: any) {
      if (mountedRef.current) setError(e.message || 'load_failed')
    }
  }, [])

  useEffect(() => {
    replayQueue().then((touched) => { if (touched && mountedRef.current) setOfflineNote(false); load() })
    const onOnline = () => { replayQueue().then(() => { if (mountedRef.current) { setOfflineNote(false); load() } }) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [load])

  const loadSeabed = useCallback(async () => {
    try {
      const sunk = await tideFetch('/waves?status=sunk')
      if (mountedRef.current) setSeabed(sunk)
    } catch (e: any) {
      if (mountedRef.current) setError(e.message || 'load_failed')
    }
  }, [])

  const setBusy = (id: string, v: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev)
      if (v) next.add(id); else next.delete(id)
      return next
    })
  }

  const doAction = useCallback(async (id: string, action: string) => {
    setBusy(id, true)
    const body = { request_id: genId() }
    try {
      await tideFetch(`/waves/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) })
      await load()
    } catch (e: any) {
      if (e.network) {
        enqueue(`/waves/${id}/${action}`, body)
        setOfflineNote(true)
      } else {
        setError(e.message || 'action_failed')
      }
    } finally {
      setBusy(id, false)
    }
  }, [load])

  const doComplete = useCallback(async (id: string) => {
    setBusy(id, true)
    const body = { request_id: genId() }
    try {
      const result = await tideFetch(`/waves/${id}/complete`, { method: 'POST', body: JSON.stringify(body) })
      if (soundOn) playChime()
      if (result.snow_awarded) setSnow(s => s + result.snow_awarded)
      setTimeout(() => { if (mountedRef.current) load() }, 550)
    } catch (e: any) {
      if (e.network) {
        enqueue(`/waves/${id}/complete`, body)
        setOfflineNote(true)
      }
      throw e
    } finally {
      setBusy(id, false)
    }
  }, [load, soundOn])

  const submitCapture = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!captureText.trim()) return
    const body = { content: captureText.trim(), request_id: genId() }
    try {
      await tideFetch('/catch-net', { method: 'POST', body: JSON.stringify(body) })
      setCaptureText('')
      setShowCapture(false)
      await load()
    } catch (e: any) {
      if (e.network) {
        enqueue('/catch-net', body)
        setCaptureText('')
        setShowCapture(false)
        setOfflineNote(true)
      } else {
        setError(e.message || 'capture_failed')
      }
    }
  }, [captureText, load])

  const discardCatch = useCallback(async (id: string) => {
    try {
      await tideFetch(`/catch-net/${id}/discard`, { method: 'POST' })
      await load()
    } catch (e: any) {
      setError(e.message || 'discard_failed')
    }
  }, [load])

  const promoteCatch = useCallback(async (id: string, v: { size: 'small' | 'big'; stakes: number; desire: number; deadline?: string }) => {
    const body = { ...v, request_id: genId() }
    try {
      await tideFetch(`/catch-net/${id}/promote`, { method: 'POST', body: JSON.stringify(body) })
      setPromotingId(null)
      await load()
    } catch (e: any) {
      if (e.network) {
        enqueue(`/catch-net/${id}/promote`, body)
        setPromotingId(null)
        setOfflineNote(true)
      } else {
        setError(e.message || 'promote_failed')
      }
    }
  }, [load])

  const setLevel = useCallback(async (level: number) => {
    try {
      await tideFetch('/levels', { method: 'POST', body: JSON.stringify({ level }) })
      setTodayLevel(level)
      await load()
    } catch (e: any) {
      setError(e.message || 'level_failed')
    }
  }, [load])

  const toggleSound = () => {
    setSoundOn(v => {
      const next = !v
      try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off') } catch {}
      return next
    })
  }

  return (
    <div className="td-page">
      <style>{TD_CSS}</style>
      <header className="td-header">
        <button className="td-back" onClick={() => onBack('home')}>‹</button>
        <span className="td-page-title">潮汐</span>
        <div className="td-header-right">
          <button className="td-moon-link" onClick={() => onBack('moon' as Page)} aria-label="月相">🌙</button>
          <button className="td-sound" onClick={toggleSound} aria-label="声音开关">{soundOn ? '🔔' : '🔕'}</button>
          <span className="td-snow">❄️ {snow}</span>
        </div>
      </header>

      {error && <div className="td-error">{error === 'today_full' ? '今天的海面满了' : '出了点小问题,稍后再试'}</div>}
      {offlineNote && <div className="td-error">现在断网,刚才那下已经记住了,等有网会自动补上</div>}

      <section className="td-section">
        <h3 className="td-section-title">潮位</h3>
        <div className="td-level-picker">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              className={`td-level-dot${todayLevel != null && n <= todayLevel ? ' filled' : ''}`}
              onClick={() => setLevel(n)}
              aria-label={`潮位 ${n}`}
            />
          ))}
        </div>
      </section>

      <section className="td-section">
        <h3 className="td-section-title">今天的浪 <span className="td-count">{today.length}/3</span></h3>
        {today.length === 0 && <p className="td-empty">还没选今天的浪</p>}
        <div className="td-list">
          {today.map(w => (
            <WaveCard key={w.id} wave={w} busy={busyIds.has(w.id)} onComplete={doComplete} />
          ))}
        </div>
      </section>

      <section className="td-section">
        <h3 className="td-section-title">浮上来的浪</h3>
        {!loading && floating.length === 0 && (
          <div className="td-empty">
            <p>海面暂时空着</p>
            {lowTide && !showAllFloating && (
              <button className="td-btn td-btn-ghost" onClick={() => { setShowAllFloating(true); loadAllFloating() }}>
                两分钟,看看大浪
              </button>
            )}
          </div>
        )}
        <div className="td-list">
          {floating.map(w => (
            <WaveCard
              key={w.id}
              wave={w}
              busy={busyIds.has(w.id)}
              onComplete={doComplete}
              onCommit={today.length < 3 ? (id) => doAction(id, 'commit') : undefined}
              onSink={(id) => doAction(id, 'sink')}
            />
          ))}
        </div>
        <div className="td-sea-tools">
          {!showAllFloating ? (
            <button className="td-link" onClick={() => { setShowAllFloating(true); loadAllFloating() }}>翻翻整片海</button>
          ) : (
            <button className="td-link" onClick={() => load()}>只看浮上来的</button>
          )}
          <button className="td-link" onClick={() => { if (seabed === null) loadSeabed(); else setSeabed(null) }}>
            {seabed === null ? '海里' : '收起海里'}
          </button>
        </div>
      </section>

      {seabed !== null && (
        <section className="td-section">
          <h3 className="td-section-title">海里</h3>
          {seabed.length === 0 && <p className="td-empty">海里很干净,没有沉着的浪</p>}
          <div className="td-list">
            {seabed.map(w => (
              <div key={w.id} className={`td-card${w.created_by_role === 'suxu' ? ' td-wave-suxu' : ''}`}>
                <div className="td-card-main">
                  <span className={`td-size td-size-${w.size}`}>{w.size === 'big' ? '大浪' : '小浪'}</span>
                  <span className="td-title">{w.title}</span>
                </div>
                <div className="td-card-actions">
                  <button className="td-btn td-btn-ghost" disabled={busyIds.has(w.id)}
                    onClick={async () => { await doAction(w.id, 'restore'); loadSeabed() }}>捞回来</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {drawer.length > 0 && (
        <section className="td-section">
          <h3 className="td-section-title">苏煦的抽屉</h3>
          <div className="td-list">
            {drawer.map(({ wave, note }) => (
              <div key={wave.id} className="td-card td-drawer-card">
                <div className="td-card-main">
                  <span className="td-size">🔒</span>
                  <span className="td-title">{wave.title}</span>
                </div>
                {note ? <p className="td-drawer-note">{note}</p> : <p className="td-drawer-note td-faint">他还没留话</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {ledger.length > 0 && (
        <section className="td-section">
          <h3 className="td-section-title">主人的账本</h3>
          <div className="td-list">
            {ledger.map(entry => (
              <div key={entry.id} className="td-ledger-card">
                <span className="td-ledger-kind">{LEDGER_LABEL[entry.kind] || entry.kind}</span>
                <span className="td-title">{entry.content}</span>
                {entry.interest_note && <span className="td-ledger-interest">{entry.interest_note}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {catchNet.length > 0 && (
        <section className="td-section">
          <h3 className="td-section-title">捞网 <span className="td-count">{catchNet.length}</span></h3>
          <div className="td-list">
            {catchNet.map(item => (
              <div key={item.id} className="td-catch-card">
                <span className="td-title">{item.content}</span>
                {promotingId === item.id ? (
                  <TagForm
                    initial={{ size: 'small', stakes: 2, desire: 2 }}
                    onCancel={() => setPromotingId(null)}
                    onSubmit={(v) => promoteCatch(item.id, v)}
                  />
                ) : (
                  <div className="td-card-actions">
                    <button className="td-btn td-btn-ghost" onClick={() => discardCatch(item.id)}>丢回海里</button>
                    <button className="td-btn td-btn-break" onClick={() => setPromotingId(item.id)}>整理成浪</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {showCapture ? (
        <form className="td-add-form" onSubmit={submitCapture}>
          <input
            className="td-input"
            placeholder="两秒丢进来,不用想清楚"
            value={captureText}
            onChange={e => setCaptureText(e.target.value)}
            autoFocus
          />
          <div className="td-add-row">
            <button type="button" className="td-btn td-btn-ghost" onClick={() => setShowCapture(false)}>取消</button>
            <button type="submit" className="td-btn td-btn-break">丢进捞网</button>
          </div>
        </form>
      ) : (
        <button className="td-fab" onClick={() => setShowCapture(true)} aria-label="捞一个">+</button>
      )}
    </div>
  )
}

const TD_CSS = `
.td-ledger-card { border-left: 3px solid var(--blue-deep); flex-direction: row; align-items: center; gap: 10px; flex-wrap: wrap; }
.td-ledger-kind { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: white; background: var(--blue-deep); flex-shrink: 0; }
.td-ledger-interest { font-size: 12px; color: var(--ink-faint); width: 100%; }
.td-page { padding: 0 16px 100px; max-width: 480px; margin: 0 auto; position: relative; min-height: 100%; }
.td-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.td-back { background: none; border: none; font-size: 24px; color: var(--ink-soft); cursor: pointer; padding: 4px 8px; }
.td-page-title { font-family: var(--font-display); font-size: 20px; color: var(--ink); letter-spacing: 0.02em; }
.td-header-right { display: flex; align-items: center; gap: 10px; }
.td-sound, .td-moon-link { background: none; border: none; font-size: 15px; cursor: pointer; opacity: 0.7; }
.td-snow { font-size: 14px; color: var(--blue-deep); }
.td-error { background: var(--glass-bg); border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; color: var(--ink-soft); font-size: 13px; text-align: center; }
.td-section { margin-bottom: 24px; }
.td-section-title { font-size: 14px; color: var(--ink-soft); font-weight: 500; margin: 0 0 10px 2px; display: flex; align-items: center; gap: 8px; }
.td-count { font-size: 12px; color: var(--ink-faint); font-weight: 400; }
.td-empty { color: var(--ink-faint); font-size: 13px; padding: 14px 2px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.td-list { display: flex; flex-direction: column; gap: 10px; }
.td-level-picker { display: flex; gap: 10px; padding: 4px 2px; }
.td-level-dot { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--glass-edge); background: oklch(1 0 0 / 0.3); cursor: pointer; padding: 0; transition: transform 0.15s var(--ease-out); }
.td-level-dot.filled { background: var(--blue); border-color: var(--blue); }
.td-level-dot:active { transform: scale(0.88); }
.td-card, .td-catch-card {
  background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 16px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
  box-shadow: var(--shadow-glass); transition: transform 0.3s var(--ease-out), opacity 0.3s var(--ease-out);
}
.td-card-main { display: flex; align-items: baseline; gap: 8px; }
.td-size { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: var(--ink-soft); background: oklch(1 0 0 / 0.5); flex-shrink: 0; }
.td-size-big { color: var(--blue-deep); }
.td-title { font-size: 15px; color: var(--ink); }
.td-card-actions { display: flex; gap: 8px; justify-content: flex-end; }
.td-btn { border: none; border-radius: 999px; padding: 7px 14px; font-size: 13px; cursor: pointer; transition: transform 0.15s var(--ease-out), opacity 0.15s; }
.td-btn:active { transform: scale(0.94); }
.td-btn:disabled { opacity: 0.5; cursor: default; }
.td-btn-ghost { background: oklch(1 0 0 / 0.4); color: var(--ink-soft); }
.td-btn-break { background: var(--blue); color: white; }
.td-burst { animation: td-burst-kf 0.55s var(--ease-out) forwards; }
@keyframes td-burst-kf {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(0.85); opacity: 0; }
}
.td-shake { animation: td-shake-kf 0.4s ease; }
@keyframes td-shake-kf {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
.td-fab {
  position: fixed; bottom: 90px; right: 24px; width: 52px; height: 52px; border-radius: 50%;
  background: var(--blue); color: white; border: none; font-size: 26px; line-height: 1;
  box-shadow: var(--shadow-dock); cursor: pointer; z-index: 5;
}
.td-add-form, .td-tag-form {
  background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 16px;
  padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow-glass);
}
.td-tag-form { padding: 10px 0 0; background: none; border: none; box-shadow: none; }
.td-input { border: none; background: oklch(1 0 0 / 0.5); border-radius: 10px; padding: 10px 12px; font-size: 14px; color: var(--ink); }
.td-add-row { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
.td-seg { display: flex; border-radius: 999px; overflow: hidden; background: oklch(1 0 0 / 0.4); }
.td-seg button { border: none; background: none; padding: 6px 14px; font-size: 13px; color: var(--ink-soft); cursor: pointer; }
.td-seg button.active { background: var(--blue); color: white; }
.td-slider-label { display: flex; flex-direction: column; font-size: 11px; color: var(--ink-faint); gap: 4px; flex: 1; }
.td-wave-suxu { border-left: 3px solid var(--blue-deep); }
.td-sea-tools { display: flex; gap: 16px; margin-top: 10px; padding-left: 2px; }
.td-link { background: none; border: none; font-size: 12px; color: var(--ink-faint); cursor: pointer; padding: 2px 0; text-decoration: underline; text-underline-offset: 3px; }
.td-drawer-card { opacity: 0.85; }
.td-drawer-note { margin: 0; font-size: 13px; color: var(--blue-deep); }
.td-faint { color: var(--ink-faint); }
.td-date { width: 100%; }
@media (prefers-reduced-motion: reduce) {
  .td-burst, .td-shake, .td-card, .td-catch-card { animation: none !important; transition: none !important; }
}
`
