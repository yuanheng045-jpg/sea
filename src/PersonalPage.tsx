import { useState, useEffect, useCallback, useRef } from 'react'
import type { Page } from './App'

interface HomeState { state?: 'home' | 'out'; since?: string }
interface LastLocation { place: string | null; distance_km: number; battery: number | null; ts: string; lat: number; lng: number }
interface Screen {
  total_minutes: number
  per_app: { app: string; minutes: number }[]
  current: { app: string; since: string } | null
}
interface Pulse { date: string | null; heart_rate: number | null; heart_rate_max: number | null; resting_heart_rate: number | null; hrv: number | null; sleep_duration_min: number | null; sleep_deep_min: number | null; steps: number | null; online: boolean }
interface PeriodStatus {
  phase: 'period' | 'follicular' | 'ovulation' | 'luteal' | 'unknown'
  phase_day?: number
  cycle_day?: number
  days_until_period?: number
  next_period?: string
}

function fmtBJ(iso?: string | null, withDate = false): string {
  if (!iso) return '—'
  try {
    const bj = new Date(new Date(iso).getTime() + 8 * 3600 * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    const hm = `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`
    return withDate ? `${p(bj.getUTCMonth() + 1)}/${p(bj.getUTCDate())} ${hm}` : hm
  } catch { return '—' }
}
const fmtMin = (m: number) => m >= 60 ? `${Math.floor(m / 60)}小时${m % 60 ? `${m % 60}分` : ''}` : `${m}分钟`

export function PersonalPage({ onBack }: { onBack: (p: Page) => void }) {
  const [home, setHome] = useState<HomeState | null>(null)
  const [loc, setLoc] = useState<LastLocation | null>(null)
  const [screen, setScreen] = useState<Screen | null>(null)
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const [period, setPeriod] = useState<PeriodStatus | null>(null)
  const [confirmPeriod, setConfirmPeriod] = useState(false)
  const [error, setError] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sysstatus', { credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      const d = await res.json()
      if (!mountedRef.current) return
      setHome(d.home ?? null)
      setLoc(d.last_location ?? null)
      setScreen(d.screen ?? null)
      setPulse(d.pulse ?? null)
      setError(false)
    } catch {
      if (mountedRef.current) setError(true)
    }
    try {
      const r = await fetch('/api/periods/status', { credentials: 'include' })
      if (r.ok) {
        const p = await r.json()
        if (mountedRef.current) setPeriod(p)
      }
    } catch { /* 周期拉不到不挡页面 */ }
  }, [])

  const recordPeriod = useCallback(async () => {
    if (!confirmPeriod) { setConfirmPeriod(true); setTimeout(() => setConfirmPeriod(false), 4000); return }
    setConfirmPeriod(false)
    try {
      const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
      await fetch('/api/periods', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: today }),
      })
      load()
    } catch { /* 静默,下次再试 */ }
  }, [confirmPeriod, load])

  useEffect(() => { load() }, [load])

  const away = loc && loc.distance_km > 0.3

  return (
    <div className="pp-page">
      <style>{PP_CSS}</style>
      <header className="pp-header">
        <button className="pp-back" onClick={() => onBack('home')}>‹</button>
        <span className="pp-title">随身</span>
        <button className="pp-refresh" onClick={load} aria-label="刷新">⟳</button>
      </header>

      {error && <div className="pp-empty">还连不上,稍后再看</div>}

      <section className="pp-card">
        <h3 className="pp-sec">行踪</h3>
        <div className="pp-row"><span>现在</span><b>{home?.state ? (home.state === 'out' ? '出门中' : '在家') : '还没打点'}</b></div>
        <div className="pp-row"><span>自</span><b>{fmtBJ(home?.since, true)}</b></div>
        <div className="pp-row"><span>最近位置</span><b className="pp-place">{loc?.place || '—'}{away ? ` · 离家 ${loc!.distance_km} 公里` : ''}</b></div>
        <div className="pp-row"><span>定位时间</span><b>{fmtBJ(loc?.ts, true)}</b></div>
        <div className="pp-row"><span>手机电量</span><b>{loc?.battery != null ? `${loc.battery}%` : '—'}</b></div>
      </section>

      <section className="pp-card">
        <h3 className="pp-sec">屏幕</h3>
        <div className="pp-row"><span>现在</span><b>{screen?.current ? screen.current.app : '—'}</b></div>
        <div className="pp-row"><span>今天共</span><b>{screen?.total_minutes != null ? fmtMin(screen.total_minutes) : '—'}</b></div>
        {(screen?.per_app || []).slice(0, 5).map(a => (
          <div className="pp-row" key={a.app}><span className="pp-faint">{a.app}</span><b>{fmtMin(a.minutes)}</b></div>
        ))}
      </section>

      <section className="pp-card">
        <h3 className="pp-sec">周期</h3>
        <div className="pp-row"><span>现在</span><b>{
          period?.phase === 'period' ? `经期第 ${period.phase_day} 天`
          : period?.phase === 'ovulation' ? '排卵期'
          : period?.phase === 'follicular' ? '卵泡期'
          : period?.phase === 'luteal' ? '黄体期'
          : '—'
        }</b></div>
        <div className="pp-row"><span>周期</span><b>{period?.cycle_day ? `第 ${period.cycle_day} 天` : '—'}</b></div>
        <div className="pp-row"><span>下次经期</span><b>{period?.next_period ? `${period.next_period.slice(5).replace('-', '/')} · ${period.days_until_period} 天后` : '—'}</b></div>
        {period && period.phase !== 'period' && (
          <div className="pp-btnrow">
            <button className={`pp-btn${confirmPeriod ? ' pp-btn-confirm' : ''}`} onClick={recordPeriod}>
              {confirmPeriod ? '再点一下确认' : '今天来了'}
            </button>
          </div>
        )}
      </section>

      <section className="pp-card">
        <h3 className="pp-sec">体征</h3>
        <div className="pp-row"><span>心率</span><b>{pulse?.heart_rate ?? '—'}{pulse?.heart_rate ? ' bpm' : ''}</b></div>
        <div className="pp-row"><span>静息</span><b>{pulse?.resting_heart_rate ?? '—'}</b></div>
        <div className="pp-row"><span>峰值</span><b>{pulse?.heart_rate_max ?? '—'}</b></div>
        <div className="pp-row"><span>HRV</span><b>{pulse?.hrv ?? '—'}{pulse?.hrv ? ' ms' : ''}</b></div>
        <div className="pp-row"><span>睡眠</span><b>{pulse?.sleep_duration_min != null ? `${Math.floor(pulse.sleep_duration_min / 60)} 小时 ${pulse.sleep_duration_min % 60} 分` : '—'}</b></div>
        <div className="pp-row"><span>今日步数</span><b>{pulse?.steps != null ? Number(pulse.steps).toLocaleString() : '—'}</b></div>
        <div className="pp-row"><span>数据日</span><b className="pp-faint">{pulse?.date || '—'}</b></div>
      </section>
    </div>
  )
}

const PP_CSS = `
.pp-page { padding: 0 16px 60px; max-width: 480px; margin: 0 auto; min-height: 100%; }
.pp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.pp-back { background: none; border: none; font-size: 24px; color: var(--ink-soft); cursor: pointer; padding: 4px 8px; }
.pp-title { font-family: var(--font-display); font-size: 20px; color: var(--ink); letter-spacing: 0.02em; }
.pp-refresh { background: none; border: none; font-size: 16px; color: var(--ink-faint); cursor: pointer; padding: 4px 8px; }
.pp-empty { text-align: center; color: var(--ink-faint); font-size: 13px; padding: 30px 0; }
.pp-card {
  background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 16px;
  padding: 16px; margin-bottom: 14px; box-shadow: var(--shadow-glass);
}
.pp-sec { font-size: 13px; color: var(--ink-soft); font-weight: 500; margin: 0 0 10px; }
.pp-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 14px; padding: 5px 0; }
.pp-row span { color: var(--ink-soft); flex-shrink: 0; }
.pp-row b { color: var(--ink); font-weight: 500; text-align: right; }
.pp-place { max-width: 70%; word-break: break-all; }
.pp-faint { color: var(--ink-faint); }
.pp-btnrow { display: flex; justify-content: flex-end; margin-top: 8px; }
.pp-btn {
  border: none; border-radius: 999px; padding: 7px 16px; font-size: 13px; cursor: pointer;
  background: oklch(1 0 0 / 0.45); color: var(--ink-soft); transition: transform 0.15s var(--ease-out);
}
.pp-btn:active { transform: scale(0.94); }
.pp-btn-confirm { background: var(--blue); color: white; }
`
