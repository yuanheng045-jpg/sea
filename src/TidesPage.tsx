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
  activity: { total_minutes: number; latest_active: string | null; compact: string; per_app: { app: string; minutes: number }[] }
}
const LEDGER_LABEL: Record<string, string> = { assigned: '布置', debt_yao: '原瑶欠', debt_suxu: '苏煦欠', punishment: '惩罚' }

const API = '/tide'
const SOUND_KEY = 'sea:tide:sound'
const UNFINISHED_TITLE = '潮间带'

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
function dayTitle(day: string) {
  const d = new Date(`${day}T00:00:00+08:00`)
  const weekday = ['日','一','二','三','四','五','六'][new Date(d.getTime() + 8 * 3600_000).getUTCDay()]
  return `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日 · 周${weekday}`
}

function uniqueWaves(rows: Wave[]) {
  return [...new Map(rows.map(row => [row.id, row])).values()]
}

function uniqueLedger(rows: LedgerEntry[]) {
  return [...new Map(rows.map(row => [row.id, row])).values()]
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
  const [catchNet, setCatchNet] = useState<CatchNetItem[]>([])
  const [snow, setSnow] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [showCapture, setShowCapture] = useState(false)
  const [captureText, setCaptureText] = useState('')
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [seabed, setSeabed] = useState<Wave[]>([])
  const [drawer, setDrawer] = useState<{ wave: Wave; note: string | null }[]>([])
  const [calendarMonth, setCalendarMonth] = useState(monthOf(bjDay()))
  const [calendar, setCalendar] = useState<CalendarMonth | null>(null)
  const [selectedDay, setSelectedDay] = useState(bjDay())
  const [dayView, setDayView] = useState<DayView | null>(null)
  const [unfinished, setUnfinished] = useState<{ waves: Wave[]; ledger: LedgerEntry[] }>({ waves: [], ledger: [] })
  const [editingDueId, setEditingDueId] = useState<string | null>(null)
  const [editDueDate, setEditDueDate] = useState('')
  const [editDueTime, setEditDueTime] = useState('')
  const [calendarExpanded, setCalendarExpanded] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [catchOpen, setCatchOpen] = useState(false)
  const [offlineNote, setOfflineNote] = useState(false)
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
  })
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    try {
      await tideFetch('/surface/recompute', { method: 'POST', body: JSON.stringify({ request_id: genId() }) })
      const [todayData, catchNetData, snowData, lockedData, sunkData] = await Promise.all([
        tideFetch('/stats/today'),
        tideFetch('/catch-net'),
        tideFetch('/stats/snow'),
        tideFetch('/waves?status=locked'),
        tideFetch('/waves?status=sunk'),
      ])
      if (!mountedRef.current) return
      setToday(todayData.committed)
      setCatchNet(catchNetData)
      setSnow(snowData.total)
      setSeabed(sunkData)
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

  useEffect(() => {
    replayQueue().then((touched) => { if (touched && mountedRef.current) setOfflineNote(false); load(); loadCalendar(calendarMonth, selectedDay) })
    const onOnline = () => { replayQueue().then(() => { if (mountedRef.current) { setOfflineNote(false); load(); loadCalendar(calendarMonth, selectedDay) } }) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [load, loadCalendar]) // 初始月份/日期由首屏 state 固定，后续切换在按钮中显式加载

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
    loadCalendar(next, nextDay)
  }, [calendarMonth, loadCalendar])

  const chooseDay = useCallback((day: string) => {
    setSelectedDay(day)
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
  const todayKey = bjDay()
  const calendarTodayWaves = (calendar?.waves || []).filter(w => w.due_day === todayKey)
  const calendarTodayLedger = (calendar?.ledger || []).filter(x => x.due_day === todayKey)
  const overdueWaves = unfinished.waves.filter(w => !!w.deadline && dueParts(w.deadline).day < todayKey)
  const overdueLedger = unfinished.ledger.filter(x => !!x.deadline && dueParts(x.deadline).day < todayKey)
  const todayWaves = uniqueWaves([...overdueWaves, ...calendarTodayWaves, ...today])
  const todayLedger = uniqueLedger([...overdueLedger, ...calendarTodayLedger])
  const todayIds = new Set(todayWaves.map(w => w.id))

  const futureMap = new Map<string, { day: string; waves: Wave[]; ledger: LedgerEntry[] }>()
  for (const wave of calendar?.waves || []) {
    if (wave.due_day <= todayKey) continue
    const group = futureMap.get(wave.due_day) || { day: wave.due_day, waves: [], ledger: [] }
    group.waves.push(wave)
    futureMap.set(wave.due_day, group)
  }
  for (const entry of calendar?.ledger || []) {
    if (entry.due_day <= todayKey) continue
    const group = futureMap.get(entry.due_day) || { day: entry.due_day, waves: [], ledger: [] }
    group.ledger.push(entry)
    futureMap.set(entry.due_day, group)
  }
  const futureGroups = [...futureMap.values()].sort((a, b) => a.day.localeCompare(b.day))

  const shoreWaves = uniqueWaves([
    ...unfinished.waves.filter(w => !w.deadline && w.status !== 'locked' && !todayIds.has(w.id)),
    ...seabed,
  ]).sort((a, b) => {
    const rank: Record<string, number> = { surfaced: 0, floating: 1, committed: 2, sunk: 3 }
    return (rank[a.status] ?? 2) - (rank[b.status] ?? 2)
  })
  const shoreLedger = unfinished.ledger.filter(x => !x.deadline)
  const selectedFocus = selectedDay !== todayKey && dayView?.day === selectedDay
    ? { day: selectedDay, waves: uniqueWaves([...dayView.waves, ...dayView.completions]), ledger: dayView.ledger }
    : null

  const renderTimeline = (group: { day: string; waves: Wave[]; ledger: LedgerEntry[] }, todayGroup = false) => (
    <section className={`td-time-day${todayGroup ? ' is-today' : ''}`} key={group.day}>
      <div className="td-time-head">
        <div>
          <span className="td-time-kicker">{todayGroup ? '今天 · 含逾期' : dayTitle(group.day)}</span>
          <strong>{todayGroup ? dayTitle(todayKey) : `${group.waves.length + group.ledger.length} 件事`}</strong>
        </div>
      </div>
      {dayView?.day === group.day && <p className="td-day-activity">{dayView.activity.compact}</p>}
      {!group.waves.length && !group.ledger.length && <p className="td-empty">今天没有赶着要办的事</p>}
      <div className="td-day-list">
        {group.waves.map(w => {
          const p = dueParts(w.deadline)
          const overdue = !!p.day && p.day < todayKey && w.status !== 'done'
          return <div key={w.id} className={`td-day-item${w.status === 'done' ? ' done' : ''}${overdue ? ' overdue' : ''}`}>
            <time>{overdue ? `晚${Math.max(1, Math.round((new Date(`${todayKey}T00:00:00+08:00`).getTime() - new Date(`${p.day}T00:00:00+08:00`).getTime()) / 864e5))}天` : w.due_has_time ? p.time : '全天'}</time>
            <div><strong>{w.title}</strong><span>{w.status === 'done' ? '已完成' : w.size === 'big' ? '大浪' : '小浪'}</span></div>
            {w.status !== 'done' && <div className="td-inline-actions">
              <button onClick={() => doComplete(w.id)}>完成</button><button onClick={() => beginDueEdit(w)}>改期</button><button onClick={() => deleteWave(w.id)}>藏起</button>
            </div>}
            {editingDueId === w.id && <div className="td-due-editor">
              <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              <input type="time" value={editDueTime} onChange={e => setEditDueTime(e.target.value)} />
              <button onClick={() => saveDue(w.id)}>存好</button><button onClick={() => setEditingDueId(null)}>取消</button>
            </div>}
          </div>
        })}
        {group.ledger.map(x => {
          const p = dueParts(x.deadline)
          const overdue = !!p.day && p.day < todayKey && x.status !== 'settled'
          return <div key={x.id} className={`td-day-item promise${x.status === 'settled' ? ' done' : ''}${overdue ? ' overdue' : ''}`}>
            <time>{overdue ? `晚${Math.max(1, Math.round((new Date(`${todayKey}T00:00:00+08:00`).getTime() - new Date(`${p.day}T00:00:00+08:00`).getTime()) / 864e5))}天` : x.due_has_time ? p.time : '全天'}</time>
            <div><strong>{x.content}</strong><span>{LEDGER_LABEL[x.kind] || '承诺'} · {x.status === 'settled' ? '已结清' : '还记着'}</span></div>
          </div>
        })}
      </div>
    </section>
  )

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

      <section className={`td-calendar-card${calendarExpanded ? ' expanded' : ''}`} aria-label="潮汐日历">
        <div className="td-cal-strip">
          <button onClick={() => chooseMonth(-1)} aria-label="上个月">‹</button>
          <button className="td-cal-summary" onClick={() => setCalendarExpanded(v => !v)} aria-expanded={calendarExpanded}>
            <strong>{Number(calendarMonth.slice(5))}月 <span>{calendarMonth.slice(0, 4)}</span></strong>
            <small>{markedDays.size ? `${markedDays.size} 天有安排` : '这个月很安静'} · {calendarExpanded ? '收起' : '展开月历'}</small>
          </button>
          <button onClick={() => chooseMonth(1)} aria-label="下个月">›</button>
        </div>
        {calendarExpanded && <div className="td-cal-grid">
          {['日','一','二','三','四','五','六'].map(d => <span key={d} className="td-cal-head">{d}</span>)}
          {dayCells.map((day, i) => {
            if (!day) return <span key={`empty-${i}`} />
            const key = `${calendarMonth}-${String(day).padStart(2, '0')}`
            return <button key={key} className={`td-cal-day${key === selectedDay ? ' selected' : ''}${key === todayKey ? ' today' : ''}`}
              onClick={() => chooseDay(key)}>
              <span>{day}</span>{markedDays.has(key) && <i />}
            </button>
          })}
        </div>}
      </section>

      {calendarExpanded && selectedFocus && <div className="td-time-flow td-focus-flow">{renderTimeline(selectedFocus)}</div>}

      <div className="td-time-flow">
        {renderTimeline({ day: todayKey, waves: todayWaves, ledger: todayLedger }, true)}
        {futureGroups.filter(group => !(calendarExpanded && group.day === selectedDay)).map(group => renderTimeline(group))}
        {!loading && !futureGroups.length && <p className="td-flow-end">往后还没有排定日子的事</p>}
      </div>

      <section className="td-section td-unfinished">
        <h3 className="td-section-title">{UNFINISHED_TITLE} <span className="td-count">{shoreWaves.length + shoreLedger.length}</span></h3>
        {!shoreWaves.length && !shoreLedger.length && <p className="td-empty">没有日期的事都收好了，这里暂时是空的</p>}
        <div className="td-list">
          {shoreWaves.map(w => w.status === 'sunk' ? (
            <div key={w.id} className="td-card td-sunk-card">
              <div className="td-card-main"><span className="td-size">海里</span><span className="td-title">{w.title}</span></div>
              <div className="td-card-actions"><button className="td-btn td-btn-ghost" disabled={busyIds.has(w.id)} onClick={() => doAction(w.id, 'restore')}>捞回来</button></div>
            </div>
          ) : (
            <WaveCard key={w.id} wave={w} busy={busyIds.has(w.id)} onComplete={doComplete}
              onCommit={today.length < 3 && ['floating','surfaced'].includes(w.status) ? (id) => doAction(id, 'commit') : undefined}
              onSink={['floating','surfaced'].includes(w.status) ? (id) => doAction(id, 'sink') : undefined} />
          ))}
          {shoreLedger.map(x => <div key={x.id} className="td-unfinished-row promise">
            <span className="td-size">承诺</span><div><strong>{x.content}</strong><small>{LEDGER_LABEL[x.kind]} · 没定日子</small></div>
          </div>)}
        </div>
      </section>

      <section className="td-section td-fold">
        <button className="td-fold-head" onClick={() => setDrawerOpen(v => !v)} aria-expanded={drawerOpen}>
          <span>苏煦的抽屉 <small>{drawer.length}</small></span><b>{drawerOpen ? '−' : '+'}</b>
        </button>
        {drawerOpen && <div className="td-list td-fold-body">
          {drawer.length === 0 && <p className="td-empty">抽屉现在空着</p>}
          {drawer.map(({ wave, note }) => <div key={wave.id} className="td-card td-drawer-card">
            <div className="td-card-main"><span className="td-size">🔒</span><span className="td-title">{wave.title}</span></div>
            {note ? <p className="td-drawer-note">{note}</p> : <p className="td-drawer-note td-faint">他还没留话</p>}
          </div>)}
        </div>}
      </section>

      <section className="td-section td-fold">
        <button className="td-fold-head" onClick={() => setCatchOpen(v => !v)} aria-expanded={catchOpen}>
          <span>捞网 <small>{catchNet.length}</small></span><b>{catchOpen ? '−' : '+'}</b>
        </button>
        {catchOpen && <div className="td-list td-fold-body">
          {catchNet.length === 0 && <p className="td-empty">捞网里没有待整理的念头</p>}
          {catchNet.map(item => <div key={item.id} className="td-catch-card">
            <span className="td-title">{item.content}</span>
            {promotingId === item.id ? <TagForm initial={{ size: 'small', stakes: 2, desire: 2 }} onCancel={() => setPromotingId(null)} onSubmit={(v) => promoteCatch(item.id, v)} />
              : <div className="td-card-actions"><button className="td-btn td-btn-ghost" onClick={() => discardCatch(item.id)}>丢回海里</button><button className="td-btn td-btn-break" onClick={() => setPromotingId(item.id)}>整理成浪</button></div>}
          </div>)}
        </div>}
      </section>

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
.td-calendar-card { background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 18px; box-shadow: var(--shadow-glass); padding: 8px 12px; margin-bottom: 18px; }
.td-calendar-card.expanded { padding-bottom: 14px; }
.td-cal-strip { display: flex; align-items: center; justify-content: space-between; }
.td-cal-strip > button { border: 0; background: transparent; color: var(--ink-soft); font-size: 24px; padding: 4px 8px; cursor: pointer; }
.td-cal-summary { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; text-align: left; }
.td-cal-summary strong { color: var(--ink); font-family: var(--font-display); font-size: 17px; font-weight: 500; }
.td-cal-summary strong span { color: var(--ink-faint); font-size: 11px; margin-left: 4px; }
.td-cal-summary small { color: var(--ink-faint); font-size: 10px; }
.td-cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 4px; }
.td-cal-head { text-align: center; font-size: 10px; color: var(--ink-faint); padding-bottom: 4px; }
.td-cal-day { position: relative; border: 0; background: transparent; color: var(--ink-soft); min-height: 38px; border-radius: 13px; display: grid; place-items: center; cursor: pointer; }
.td-cal-day span { font-family: var(--font-display); font-size: 14px; }
.td-cal-day i { width: 4px; height: 4px; border-radius: 50%; background: var(--blue-deep); position: absolute; bottom: 4px; }
.td-cal-day.today { box-shadow: inset 0 0 0 1px var(--blue); }
.td-cal-day.selected { background: var(--blue); color: white; }
.td-cal-day.selected i { background: white; }
.td-time-flow { position: relative; margin: 0 0 28px 8px; padding-left: 19px; }
.td-focus-flow { margin-bottom: 12px; }
.td-time-flow::before { content: ''; position: absolute; left: 3px; top: 15px; bottom: 12px; width: 1px; background: linear-gradient(var(--blue),var(--glass-edge)); }
.td-time-day { position: relative; background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 18px; padding: 14px; margin-bottom: 12px; box-shadow: var(--shadow-glass); }
.td-time-day::before { content: ''; position: absolute; left: -21px; top: 20px; width: 7px; height: 7px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 4px var(--glass-bg); }
.td-time-day.is-today { border-color: color-mix(in oklch,var(--blue) 38%,var(--glass-edge)); }
.td-time-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.td-time-head > div { display: flex; flex-direction: column; gap: 2px; }
.td-time-kicker { color: var(--blue-deep); font-size: 11px; }
.td-time-head strong { color: var(--ink); font: 500 16px var(--font-display); }
.td-flow-end { color: var(--ink-faint); font-size: 11px; margin: 14px 0 0; }
.td-day-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.td-day-item { display: grid; grid-template-columns: 44px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--glass-edge); }
.td-day-item time { color: var(--blue-deep); font-size: 12px; font-variant-numeric: tabular-nums; }
.td-day-item.overdue time { color: #b66a64; font-weight: 600; }
.td-day-item strong, .td-unfinished-row strong { display: block; color: var(--ink); font-size: 14px; font-weight: 500; }
.td-day-item span, .td-unfinished-row small { display: block; color: var(--ink-faint); font-size: 11px; margin-top: 2px; }
.td-day-item.done { opacity: .58; }
.td-day-item.done strong { text-decoration: line-through; }
.td-day-item.promise { border-left: 2px solid var(--blue-deep); padding-left: 8px; }
.td-inline-actions { display: flex; gap: 6px; }
.td-inline-actions button, .td-due-editor button { border: 0; background: oklch(1 0 0 / .45); color: var(--ink-soft); border-radius: 999px; padding: 5px 8px; font-size: 11px; cursor: pointer; }
.td-due-editor { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; }
.td-due-editor input { min-width: 112px; flex: 1; border: 0; border-radius: 9px; padding: 7px; color: var(--ink); background: oklch(1 0 0 / .5); }
.td-day-activity { margin: 7px 0 0; color: var(--ink-faint); font-size: 11px; text-align: right; }
.td-gaze { color: var(--blue-deep); font-size: 11px; margin: 12px 0 0; }
.td-unfinished { margin-top: 4px; }
.td-unfinished-row { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 9px; padding: 11px 12px; border-radius: 14px; background: var(--glass-bg); border: 1px solid var(--glass-edge); }
.td-unfinished-row.promise { border-left: 3px solid var(--blue-deep); }
.td-unfinished-row .td-due-editor { margin-top: 4px; }
.td-sunk-card { opacity: .72; }
.td-fold { margin-bottom: 10px; border-top: 1px solid var(--glass-edge); }
.td-fold-head { width: 100%; border: 0; background: transparent; color: var(--ink-soft); padding: 13px 2px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; text-align: left; }
.td-fold-head span { font-size: 13px; }
.td-fold-head small { color: var(--ink-faint); margin-left: 5px; }
.td-fold-head b { color: var(--ink-faint); font-size: 18px; font-weight: 400; }
.td-fold-body { padding-bottom: 12px; }
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
.td-link { background: none; border: none; font-size: 12px; color: var(--ink-faint); cursor: pointer; padding: 2px 0; text-decoration: underline; text-underline-offset: 3px; }
.td-drawer-card { opacity: 0.85; }
.td-drawer-note { margin: 0; font-size: 13px; color: var(--blue-deep); }
.td-faint { color: var(--ink-faint); }
.td-date { width: 100%; }
@media (max-width: 380px) {
  .td-day-item { grid-template-columns: 40px minmax(0,1fr); }
  .td-inline-actions { grid-column: 2; justify-content: flex-end; }
}
@media (prefers-reduced-motion: reduce) {
  .td-burst, .td-shake, .td-card, .td-catch-card { animation: none !important; transition: none !important; }
}
`
