import { useCallback, useEffect, useRef, useState } from 'react'

type MoodPoint = { ts: number; m: number; d: number; t: number; e: number; label: string }
type HeartPoint = { ts: number; hr: number }
type Hover<T> = { x: number; point: T }

const MOOD_SERIES = [
  ['m', '#4f83bd', '心情'],
  ['d', '#bd6f98', '欲望'],
  ['t', '#3b9b79', '牵挂'],
  ['e', '#c96f68', '刺'],
] as const

function bjTime(ms: number, full = true): string {
  return new Date(ms).toLocaleString('zh-CN', full
    ? { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' })
}

async function hubPin(): Promise<string> {
  let pin = localStorage.getItem('sea-channel-pin') || ''
  if (pin) return pin
  try {
    const r = await fetch('/cc-api/pin-check', { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      if (d?.ok && typeof d.pin === 'string') {
        pin = d.pin
        localStorage.setItem('sea-channel-pin', pin)
      }
    }
  } catch (e) { console.error('[status charts] pin:', e) }
  if (!pin) throw new Error('请先打开主聊天页完成登录')
  return pin
}

async function hubJson(path: string): Promise<any> {
  const pin = await hubPin()
  const r = await fetch('/cc-api' + path, { credentials: 'include', headers: { 'X-Channel-Pin': pin } })
  if (!r.ok) throw new Error(r.status === 401 ? '主聊天页 PIN 已失效' : `HTTP ${r.status}`)
  return r.json()
}

function parseMood(row: any): MoodPoint | null {
  const raw = String(row?.raw || '')
  const out: any = { ts: Date.parse(row?.ts), label: '' }
  for (const key of ['m', 'd', 't', 'e']) {
    const hit = raw.match(new RegExp(`(?:^|\\|)${key}([0-9]+(?:\\.[0-9]+)?)`, 'i'))
    out[key] = hit ? Number(hit[1]) : NaN
  }
  const parts = raw.split('|')
  out.label = parts.length > 4 ? parts.slice(4).join('|').trim() : ''
  if (!Number.isFinite(out.ts) || ['m', 'd', 't', 'e'].some(k => !Number.isFinite(out[k]) || out[k] < 0 || out[k] > 1)) return null
  return out as MoodPoint
}

function median(values: number[]): number {
  if (!values.length) return 0
  const a = [...values].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

function canvasBox(canvas: HTMLCanvasElement) {
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const w = Math.max(280, canvas.clientWidth || 320)
  const h = Math.max(205, canvas.clientHeight || 220)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h, left: 34, right: 10, top: 14, bottom: 28 }
}

function frame(canvas: HTMLCanvasElement, minT: number, maxT: number, yMin: number, yMax: number, ticks = 4) {
  const c = canvasBox(canvas), { ctx } = c
  ctx.clearRect(0, 0, c.w, c.h)
  ctx.font = '10px DM Sans, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = 'rgba(70,83,105,.13)'
  ctx.fillStyle = 'rgba(70,83,105,.58)'
  ctx.lineWidth = 1
  for (let i = 0; i <= ticks; i++) {
    const value = yMin + (yMax - yMin) * i / ticks
    const y = c.h - c.bottom - (c.h - c.top - c.bottom) * i / ticks
    ctx.beginPath(); ctx.moveTo(c.left, y); ctx.lineTo(c.w - c.right, y); ctx.stroke()
    ctx.textAlign = 'right'; ctx.fillText(yMax <= 1.1 ? value.toFixed(1) : String(Math.round(value)), c.left - 5, y)
  }
  const span = Math.max(1, maxT - minT)
  for (let i = 0; i <= 3; i++) {
    const t = minT + span * i / 3
    const x = c.left + (c.w - c.left - c.right) * i / 3
    ctx.textAlign = i === 0 ? 'left' : i === 3 ? 'right' : 'center'
    ctx.fillText(new Date(t).toLocaleString('zh-CN', span > 2 * 864e5
      ? { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }
      : { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }), x, c.h - 10)
  }
  return c
}

function emptyCanvas(canvas: HTMLCanvasElement, text: string, yMin: number, yMax: number) {
  const now = Date.now(), c = frame(canvas, now - 864e5, now, yMin, yMax)
  c.ctx.fillStyle = 'rgba(70,83,105,.55)'; c.ctx.font = '12px DM Sans, sans-serif'; c.ctx.textAlign = 'center'
  c.ctx.fillText(text, c.w / 2, c.h / 2)
}

function useCanvas(draw: (canvas: HTMLCanvasElement) => void) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const redraw = () => draw(canvas)
    redraw()
    const ro = new ResizeObserver(redraw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [draw])
  return ref
}

function MoodCanvas({ points }: { points: MoodPoint[] }) {
  const [hover, setHover] = useState<Hover<MoodPoint> | null>(null)
  const draw = useCallback((canvas: HTMLCanvasElement) => {
    if (!points.length) { emptyCanvas(canvas, '还没有可看的昨日心事', 0, 1); return }
    let minT = points[0].ts, maxT = points[points.length - 1].ts
    if (minT === maxT) { minT -= 1800e3; maxT += 1800e3 }
    const c = frame(canvas, minT, maxT, 0, 1, 5), { ctx } = c
    const x = (t: number) => c.left + (c.w - c.left - c.right) * (t - minT) / (maxT - minT)
    const y = (v: number) => c.h - c.bottom - (c.h - c.top - c.bottom) * v
    for (const [key, color] of MOOD_SERIES) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.8
      points.forEach((p, i) => i ? ctx.lineTo(x(p.ts), y(p[key])) : ctx.moveTo(x(p.ts), y(p[key])))
      ctx.stroke(); ctx.fillStyle = color
      points.forEach(p => { ctx.beginPath(); ctx.arc(x(p.ts), y(p[key]), 2.4, 0, Math.PI * 2); ctx.fill() })
    }
  }, [points])
  const ref = useCanvas(draw)
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!points.length) return
    const rect = e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, (px - 34) / Math.max(1, rect.width - 44)))
    const minT = points[0].ts, maxT = points[points.length - 1].ts
    const target = minT + (maxT - minT) * ratio
    const point = points.reduce((best, p) => Math.abs(p.ts - target) < Math.abs(best.ts - target) ? p : best)
    setHover({ x: px, point })
  }
  return <div className="st-chart-wrap">
    <canvas ref={ref} className="st-chart-canvas" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} />
    {hover && <div className={`st-chart-tip${hover.x > 210 ? ' left' : ''}`} style={{ left: hover.x }}>
      <b>{bjTime(hover.point.ts)}</b>
      <span>心情 {hover.point.m.toFixed(1)} · 欲望 {hover.point.d.toFixed(1)}</span>
      <span>牵挂 {hover.point.t.toFixed(1)} · 刺 {hover.point.e.toFixed(1)}</span>
      {hover.point.label && <em>{hover.point.label}</em>}
    </div>}
  </div>
}

function HeartCanvas({ points }: { points: HeartPoint[] }) {
  const [hover, setHover] = useState<Hover<HeartPoint> | null>(null)
  const peak = points.length ? points.reduce((best, p) => p.hr > best.hr ? p : best) : null
  const draw = useCallback((canvas: HTMLCanvasElement) => {
    if (!points.length) { emptyCanvas(canvas, '等待新的心率上报', 40, 140); return }
    let minT = points[0].ts, maxT = points[points.length - 1].ts
    if (minT === maxT) { minT -= 1800e3; maxT += 1800e3 }
    const hrs = points.map(p => p.hr)
    let yMin = Math.max(30, Math.floor((Math.min(...hrs) - 10) / 10) * 10)
    let yMax = Math.min(240, Math.ceil((Math.max(...hrs) + 10) / 10) * 10)
    if (yMax - yMin < 40) { yMin = Math.max(30, yMin - 10); yMax = Math.min(240, yMax + 10) }
    const c = frame(canvas, minT, maxT, yMin, yMax), { ctx } = c
    const x = (t: number) => c.left + (c.w - c.left - c.right) * (t - minT) / (maxT - minT)
    const y = (v: number) => c.h - c.bottom - (c.h - c.top - c.bottom) * (v - yMin) / (yMax - yMin)
    const diffs = points.slice(1).map((p, i) => p.ts - points[i].ts).filter(v => v > 0)
    const gapLimit = Math.max(10 * 60e3, median(diffs) * 3)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], gap = b.ts - a.ts
      if (gap > gapLimit) { ctx.fillStyle = 'rgba(90,100,115,.08)'; ctx.fillRect(x(a.ts), c.top, x(b.ts) - x(a.ts), c.h - c.top - c.bottom) }
      ctx.beginPath(); ctx.moveTo(x(a.ts), y(a.hr)); ctx.lineTo(x(b.ts), y(b.hr))
      ctx.strokeStyle = gap > gapLimit ? 'rgba(90,100,115,.48)' : '#4f91bd'; ctx.lineWidth = gap > gapLimit ? 1.3 : 1.9
      ctx.setLineDash(gap > gapLimit ? [4, 4] : []); ctx.stroke(); ctx.setLineDash([])
    }
    ctx.fillStyle = '#4f91bd'
    points.forEach(p => { ctx.beginPath(); ctx.arc(x(p.ts), y(p.hr), 2.2, 0, Math.PI * 2); ctx.fill() })
    if (peak) {
      const px = x(peak.ts), py = y(peak.hr)
      ctx.fillStyle = '#c96f68'; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill()
      ctx.font = '10px DM Sans, sans-serif'; ctx.textAlign = px > c.w - 80 ? 'right' : 'left'
      ctx.fillText(`峰值 ${Math.round(peak.hr)}`, px + (px > c.w - 80 ? -7 : 7), Math.max(c.top + 6, py - 9))
    }
  }, [points, peak])
  const ref = useCanvas(draw)
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!points.length) return
    const rect = e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, (px - 34) / Math.max(1, rect.width - 44)))
    const target = points[0].ts + (points[points.length - 1].ts - points[0].ts) * ratio
    const point = points.reduce((best, p) => Math.abs(p.ts - target) < Math.abs(best.ts - target) ? p : best)
    setHover({ x: px, point })
  }
  return <div className="st-chart-wrap">
    <canvas ref={ref} className="st-chart-canvas" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} />
    {hover && <div className={`st-chart-tip${hover.x > 210 ? ' left' : ''}`} style={{ left: hover.x }}>
      <b>{bjTime(hover.point.ts)}</b><strong>{Math.round(hover.point.hr)} BPM</strong>
      {peak === hover.point && <em>本时段峰值</em>}
    </div>}
  </div>
}

export function StatusCharts() {
  const [moods, setMoods] = useState<MoodPoint[]>([])
  const [moodCutoff, setMoodCutoff] = useState<string | null>(null)
  const [moodErr, setMoodErr] = useState<string | null>(null)
  const [heart, setHeart] = useState<HeartPoint[]>([])
  const [heartErr, setHeartErr] = useState<string | null>(null)
  const [days, setDays] = useState(1)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    setMoodErr(null)
    hubJson('/api/mood-history').then(d => {
      if (!alive) return
      setMoodCutoff(d?.cutoff || null)
      setMoods((d?.rows || []).map(parseMood).filter(Boolean).sort((a: MoodPoint, b: MoodPoint) => a.ts - b.ts))
    }).catch(e => alive && setMoodErr(String(e?.message || e)))
    return () => { alive = false }
  }, [refresh])

  useEffect(() => {
    let alive = true
    setHeartErr(null)
    const since = new Date(Date.now() - days * 864e5).toISOString()
    hubJson('/api/heart-history?since=' + encodeURIComponent(since)).then(d => {
      if (!alive) return
      setHeart((d?.rows || []).map((p: any) => ({ ts: Date.parse(p.ts), hr: Number(p.hr) }))
        .filter((p: HeartPoint) => Number.isFinite(p.ts) && Number.isFinite(p.hr) && p.hr >= 25 && p.hr <= 260)
        .sort((a: HeartPoint, b: HeartPoint) => a.ts - b.ts))
    }).catch(e => alive && setHeartErr(String(e?.message || e)))
    return () => { alive = false }
  }, [days, refresh])

  const peak = heart.length ? Math.max(...heart.map(p => p.hr)) : null
  return <>
    <section className="glass st-card st-card-wide st-chart-card">
      <div className="st-cardhead">
        <span className="st-chart-icon">∿</span><h3>情绪曲线 <em>mood · 昨日以前</em></h3>
        <button className="st-expand" onClick={() => setRefresh(v => v + 1)}>刷新</button>
      </div>
      <div className="st-chart-legend">{MOOD_SERIES.map(([, color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div>
      {moodErr ? <div className="st-chart-error">{moodErr}</div> : <MoodCanvas points={moods} />}
      <div className="st-chart-note">{moodCutoff ? `可见至 ${bjTime(Date.parse(moodCutoff) - 1, false)} · ${moods.length} 点` : '今天的心事由后端保密，过零点后才出现'}</div>
    </section>

    <section className="glass st-card st-card-wide st-chart-card">
      <div className="st-cardhead">
        <span className="st-chart-icon heart">♥</span><h3>心率回放 <em>heart rate</em></h3>
        <select className="st-chart-range" value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={1}>24小时</option><option value={7}>7天</option><option value={30}>30天</option>
        </select>
      </div>
      {heartErr ? <div className="st-chart-error">{heartErr}</div> : <HeartCanvas points={heart} />}
      <div className="st-chart-note">灰色虚线为断连区间 · {heart.length} 点{peak != null ? ` · 峰值 ${Math.round(peak)} BPM` : ''}</div>
    </section>
  </>
}
