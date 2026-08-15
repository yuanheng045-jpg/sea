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
  due_has_time?: boolean
  done_at?: string | null
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
  deadline?: string | null
  due_has_time?: boolean
}
interface CalendarMonth { month: string; waves: (Wave & { due_day: string })[]; ledger: (LedgerEntry & { due_day: string })[] }
interface DayView {
  day: string
  waves: Wave[]
  ledger: LedgerEntry[]
  completions: (Wave & { completed_at: string })[]
  ledger_changes: { op: string; row_id: string; ts: string; before?: LedgerEntry; after?: LedgerEntry }[]
  gaze: { view_count: number; last_view_at: string | null; notes: { ts: string; note: string }[] }
  report: { compact: string; generated_at: string } | null
}
const LEDGER_LABEL: Record<string, string> = { assigned: '布置', debt_yao: '原瑶欠', debt_suxu: '苏煦欠', punishment: '惩罚' }

const API = '/tide'
const SOUND_KEY = 'sea:tide:sound'
const UNFINISHED_TITLE = '还在海上'

function bjDay(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}
function monthOf(day: string) { return day.slice(0, 7) }
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function monthDays(month: string) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[]
}
function dueParts(deadline?: string | null) {
  if (!deadline) return { day: '', time: '' }
  const d = new Date(deadline)
  const local = new Date(d.getTime() + 8 * 3600_000).toISOString()
  return { day: local.slice(0, 10), time: local.slice(11, 16) }
}
function dueLabel(item: { deadline?: string | null; due_has_time?: boolean }) {
  if (!item.deadline) return '没定日子'
  const { day, time } = dueParts(item.deadline)
  const diff = Math.round((new Date(`${day}T00:00:00+08:00`).getTime() - new Date(`${bjDay()}T00:00:00+08:00`).getTime()) / 864e5)
  const distance = diff === 0 ? '今天' : diff > 0 ? `还剩 ${diff} 天` : `晚了 ${-diff} 天`
  return `${item.due_has_time ? time : '全天'} · ${distance}`
}

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
  onSubmit: (v: { size: 'small' | 'big'; stakes: number; desire: number; due_date?: string; due_time?: string }) => void
}) {
  const [size, setSize] = useState<'small' | 'big'>(initial.size)
  const [stakes, setStakes] = useState(initial.stakes)
  const [desire, setDesire] = useState(initial.desire)
  const [deadline, setDeadline] = useState('')
  const [dueTime, setDueTime] = useState('')
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
        {deadline && <label className="td-slider-label">具体时间(可不填)
          <input type="time" className="td-input td-date" value={dueTime} onChange={e => setDueTime(e.target.value)} />
        </label>}
      </div>
      <div className="td-add-row">
        <button type="button" className="td-btn td-btn-ghost" onClick={onCancel}>取消</button>
        <button type="button" className="td-btn td-btn-break" onClick={() => onSubmit({ size, stakes, desire, due_date: deadline || undefined, due_time: dueTime || undefined })}>放进海里</button>
      </div>
    </div>
  )
}

export function TidesPage({ onBack }: { onBack: (p: Page) => void }) {
  const [today, setToday] = useState<Wave[]>([])
  const [floating, setFloating] = useState<Wave[]>([])
  const [catchNet, setCatchNet] = useState<CatchNetItem[]>([])
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
  const [calendarMonth, setCalendarMonth] = useState(monthOf(bjDay()))
  const [calendar, setCalendar] = useState<CalendarMonth | null>(null)
  const [selectedDay, setSelectedDay] = useState(bjDay())
  const [dayView, setDayView] = useState<DayView | null>(null)
  const [unfinished, setUnfinished] = useState<{ waves: Wave[]; ledger: LedgerEntry[] }>({ waves: [], ledger: [] })
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [editDueDate, setEditDueDate] = useState('')
  const [editDueTime, setEditDueTime] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [offlineNote, setOfflineNote] = useState(false)
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
  })
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    try {
      const surfaceResult = await tideFetch('/surface/recompute', { method: 'POST', body: JSON.stringify({ request_id: genId() }) })
      const [todayData, catchNetData, snowData, levelData, lockedData] = await Promise.all([
        tideFetch('/stats/today'),
        tideFetch('/catch-net'),
        tideFetch('/stats/snow'),
        tideFetch('/levels/today'),
        tideFetch('/waves?status=locked'),
      ])
      if (!mountedRef.current) return
      setFloating(surfaceResult.surfaced)
      setLowTide(surfaceResult.low_tide)
      setToday(todayData.committed)
      setCatchNet(catchNetData)
      setSnow(snowData.total)
      setTodayLevel(levelData.level)
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

  const loadCalendar = useCallback(async (month: string, day: string) => {
    try {
      const [monthData, selectedData, unfinishedData] = await Promise.all([
        tideFetch(`/stats/calendar/${month}`),
        tideFetch(`/stats/day/${day}`),
        tideFetch('/stats/unfinished'),
      ])
      if (!mountedRef.current) return
      setCalendar(monthData)
      setDayView(selectedData)
      setUnfinished(unfinishedData)
      setError(null)
    } catch (e: any) {
      if (mountedRef.current) setError(e.message || 'calendar_failed')
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
    replayQueue().then((touched) => { if (touched && mountedRef.current) setOfflineNote(false); load(); loadCalendar(calendarMonth, selectedDay) })
    const onOnline = () => { replayQueue().then(() => { if (mountedRef.current) { setOfflineNote(false); load(); loadCalendar(calendarMonth, selectedDay) } }) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [load, loadCalendar]) // 初始月份/日期由首屏 state 固定，后续切换在按钮中显式加载

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
      await Promise.all([load(), loadCalendar(calendarMonth, selectedDay)])
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
  }, [load, loadCalendar, calendarMonth, selectedDay])

  const doComplete = useCallback(async (id: string) => {
    setBusy(id, true)
    const body = { request_id: genId() }
    try {
      const result = await tideFetch(`/waves/${id}/complete`, { method: 'POST', body: JSON.stringify(body) })
      if (soundOn) playChime()
      if (result.snow_awarded) setSnow(s => s + result.snow_awarded)
      setTimeout(() => { if (mountedRef.current) { load(); loadCalendar(calendarMonth, selectedDay) } }, 550)
    } catch (e: any) {
      if (e.network) {
        enqueue(`/waves/${id}/complete`, body)
        setOfflineNote(true)
      }
      throw e
    } finally {
      setBusy(id, false)
    }
  }, [load, loadCalendar, calendarMonth, selectedDay, soundOn])

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

  const promoteCatch = useCallback(async (id: string, v: { size: 'small' | 'big'; stakes: number; desire: number; due_date?: string; due_time?: string }) => {
    const body = { ...v, request_id: genId() }
    try {
      await tideFetch(`/catch-net/${id}/promote`, { method: 'POST', body: JSON.stringify(body) })
      setPromotingId(null)
      await Promise.all([load(), loadCalendar(calendarMonth, selectedDay)])
    } catch (e: any) {
      if (e.network) {
        enqueue(`/catch-net/${id}/promote`, body)
        setPromotingId(null)
        setOfflineNote(true)
      } else {
        setError(e.message || 'promote_failed')
      }
    }
  }, [load, loadCalendar, calendarMonth, selectedDay])

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

  const chooseMonth = useCallback((delta: number) => {
    const next = shiftMonth(calendarMonth, delta)
    const nextDay = `${next}-01`
    setCalendarMonth(next)
    setSelectedDay(nextDay)
    setReportOpen(false)
    loadCalendar(next, nextDay)
  }, [calendarMonth, loadCalendar])

  const chooseDay = useCallback((day: string) => {
    setSelectedDay(day)
    setReportOpen(false)
    loadCalendar(calendarMonth, day)
  }, [calendarMonth, loadCalendar])

  const beginDueEdit = (wave: Wave) => {
    const p = dueParts(wave.deadline)
    setEditingDueId(wave.id)
    setEditDueDate(p.day || selectedDay)
    setEditDueTime(wave.due_has_time ? p.time : '')
  }

  const saveDue = useCallback(async (id: string) => {
    try {
      await tideFetch(`/waves/${id}/due`, {
        method: 'PATCH',
        body: JSON.stringify({ due_date: editDueDate || null, due_time: editDueTime || undefined, request_id: genId() }),
      })
      setEditingDueId(null)
      await Promise.all([load(), loadCalendar(calendarMonth, selectedDay)])
    } catch (e: any) { setError(e.message || 'reschedule_failed') }
  }, [editDueDate, editDueTime, load, loadCalendar, calendarMonth, selectedDay])

  const deleteWave = useCallback(async (id: string) => {
    if (!window.confirm('把这件事从潮汐里藏起来？之后仍可以撤回。')) return
    try {
      await tideFetch(`/waves/${id}/delete`, { method: 'POST', body: JSON.stringify({ request_id: genId() }) })
      await Promise.all([load(), loadCalendar(calendarMonth, selectedDay)])
    } catch (e: any) { setError(e.message || 'delete_failed') }
  }, [load, loadCalendar, calendarMonth, selectedDay])

  const markedDays = new Set([
    ...(calendar?.waves || []).map(x => x.due_day),
    ...(calendar?.ledger || []).map(x => x.due_day),
  ])
  const dayCells = monthDays(calendarMonth)
  const selectedCompletionIds = new Set((dayView?.waves || []).filter(w => w.status === 'done').map(w => w.id))

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

      <section className="td-calendar-card" aria-label="潮汐日历">
        <div className="td-cal-nav">
          <button onClick={() => chooseMonth(-1)} aria-label="上个月">‹</button>
          <strong>{Number(calendarMonth.slice(5))}月 <span>{calendarMonth.slice(0, 4)}</span></strong>
          <button onClick={() => chooseMonth(1)} aria-label="下个月">›</button>
        </div>
        <div className="td-cal-grid">
          {['日','一','二','三','四','五','六'].map(d => <span key={d} className="td-cal-head">{d}</span>)}
          {dayCells.map((day, i) => {
            if (!day) return <span key={`empty-${i}`} />
            const key = `${calendarMonth}-${String(day).padStart(2, '0')}`
            return <button key={key} className={`td-cal-day${key === selectedDay ? ' selected' : ''}${key === bjDay() ? ' today' : ''}`}
              onClick={() => chooseDay(key)}>
              <span>{day}</span>{markedDays.has(key) && <i />}
            </button>
          })}
        </div>
      </section>

      <section className="td-day-panel">
        <div className="td-day-head">
          <h3>{selectedDay.slice(5).replace('-', '月')}日</h3>
          {dayView?.report && <button className="td-link" onClick={() => setReportOpen(v => !v)}>{reportOpen ? '收起夜报' : '翻当天夜报'}</button>}
        </div>
        {reportOpen && dayView?.report && <p className="td-report">{dayView.report.compact}</p>}
        {!dayView?.waves.length && !dayView?.ledger.length && !dayView?.completions.length && <p className="td-empty">这天还没有安排</p>}
        <div className="td-day-list">
          {dayView?.waves.map(w => {
            const p = dueParts(w.deadline)
            return <div key={w.id} className={`td-day-item${w.status === 'done' ? ' done' : ''}`}>
              <time>{w.due_has_time ? p.time : '全天'}</time>
              <div><strong>{w.title}</strong><span>{w.status === 'done' ? '已完成' : w.size === 'big' ? '大浪' : '小浪'}</span></div>
              {w.status !== 'done' && <div className="td-inline-actions">
                <button onClick={() => beginDueEdit(w)}>改期</button><button onClick={() => deleteWave(w.id)}>藏起</button>
              </div>}
              {editingDueId === w.id && <div className="td-due-editor">
                <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                <input type="time" value={editDueTime} onChange={e => setEditDueTime(e.target.value)} />
                <button onClick={() => saveDue(w.id)}>存好</button><button onClick={() => setEditingDueId(null)}>取消</button>
              </div>}
            </div>
          })}
          {dayView?.ledger.map(x => <div key={x.id} className="td-day-item promise">
            <time>{x.due_has_time ? dueParts(x.deadline).time : '全天'}</time>
            <div><strong>{x.content}</strong><span>{LEDGER_LABEL[x.kind] || '承诺'} · {x.status === 'settled' ? '已结清' : '还记着'}</span></div>
          </div>)}
          {dayView?.completions.filter(w => !selectedCompletionIds.has(w.id)).map(w => <div key={`done-${w.id}`} className="td-day-item done">
            <time>{dueParts(w.completed_at).time}</time><div><strong>{w.title}</strong><span>这天完成</span></div>
          </div>)}
        </div>
        {!!dayView?.gaze.view_count && <p className="td-gaze">苏煦这天来看过 {dayView.gaze.view_count} 次{dayView.gaze.notes.length ? `，留了 ${dayView.gaze.notes.length} 句话` : ''}</p>}
      </section>

      <section className="td-section td-unfinished">
        <h3 className="td-section-title">{UNFINISHED_TITLE} <span className="td-count">{unfinished.waves.length + unfinished.ledger.length}</span></h3>
        {!unfinished.waves.length && !unfinished.ledger.length && <p className="td-empty">海面安安静静，暂时没有没办完的事</p>}
        <div className="td-list">
          {unfinished.waves.map(w => <div key={w.id} className="td-unfinished-row">
            <span className={`td-size td-size-${w.size}`}>{w.size === 'big' ? '大浪' : '小浪'}</span>
            <div><strong>{w.title}</strong><small>{dueLabel(w)}</small></div>
            <button className="td-link" onClick={() => beginDueEdit(w)}>改期</button>
            {editingDueId === w.id && <div className="td-due-editor">
              <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              <input type="time" value={editDueTime} onChange={e => setEditDueTime(e.target.value)} />
              <button onClick={() => saveDue(w.id)}>存好</button><button onClick={() => setEditingDueId(null)}>取消</button>
            </div>}
          </div>)}
          {unfinished.ledger.map(x => <div key={x.id} className="td-unfinished-row promise">
            <span className="td-size">承诺</span><div><strong>{x.content}</strong><small>{LEDGER_LABEL[x.kind]} · {dueLabel(x)}</small></div>
          </div>)}
        </div>
      </section>

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
.td-calendar-card, .td-day-panel { background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 22px; box-shadow: var(--shadow-glass); padding: 16px; margin-bottom: 16px; }
.td-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.td-cal-nav button { border: 0; background: transparent; color: var(--ink-soft); font-size: 25px; padding: 0 8px; cursor: pointer; }
.td-cal-nav strong { color: var(--ink); font-family: var(--font-display); font-size: 18px; font-weight: 500; }
.td-cal-nav strong span { color: var(--ink-faint); font-size: 12px; margin-left: 4px; }
.td-cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 4px; }
.td-cal-head { text-align: center; font-size: 10px; color: var(--ink-faint); padding-bottom: 4px; }
.td-cal-day { position: relative; border: 0; background: transparent; color: var(--ink-soft); min-height: 38px; border-radius: 13px; display: grid; place-items: center; cursor: pointer; }
.td-cal-day span { font-family: var(--font-display); font-size: 14px; }
.td-cal-day i { width: 4px; height: 4px; border-radius: 50%; background: var(--blue-deep); position: absolute; bottom: 4px; }
.td-cal-day.today { box-shadow: inset 0 0 0 1px var(--blue); }
.td-cal-day.selected { background: var(--blue); color: white; }
.td-cal-day.selected i { background: white; }
.td-day-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.td-day-head h3 { margin: 0; color: var(--ink); font: 500 17px var(--font-display); }
.td-day-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.td-day-item { display: grid; grid-template-columns: 44px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--glass-edge); }
.td-day-item time { color: var(--blue-deep); font-size: 12px; font-variant-numeric: tabular-nums; }
.td-day-item strong, .td-unfinished-row strong { display: block; color: var(--ink); font-size: 14px; font-weight: 500; }
.td-day-item span, .td-unfinished-row small { display: block; color: var(--ink-faint); font-size: 11px; margin-top: 2px; }
.td-day-item.done { opacity: .58; }
.td-day-item.done strong { text-decoration: line-through; }
.td-day-item.promise { border-left: 2px solid var(--blue-deep); padding-left: 8px; }
.td-inline-actions { display: flex; gap: 6px; }
.td-inline-actions button, .td-due-editor button { border: 0; background: oklch(1 0 0 / .45); color: var(--ink-soft); border-radius: 999px; padding: 5px 8px; font-size: 11px; cursor: pointer; }
.td-due-editor { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; }
.td-due-editor input { min-width: 112px; flex: 1; border: 0; border-radius: 9px; padding: 7px; color: var(--ink); background: oklch(1 0 0 / .5); }
.td-report { white-space: pre-wrap; color: var(--ink-soft); line-height: 1.7; font-size: 13px; background: oklch(1 0 0 / .28); border-radius: 12px; padding: 12px; }
.td-gaze { color: var(--blue-deep); font-size: 11px; margin: 12px 0 0; }
.td-unfinished { margin-top: 22px; }
.td-unfinished-row { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 9px; padding: 11px 12px; border-radius: 14px; background: var(--glass-bg); border: 1px solid var(--glass-edge); }
.td-unfinished-row.promise { border-left: 3px solid var(--blue-deep); }
.td-unfinished-row .td-due-editor { margin-top: 4px; }
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
