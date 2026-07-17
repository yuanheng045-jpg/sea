import { useState, useEffect, useCallback, useRef } from 'react'
import type { Page } from './App'

interface Overview {
  day_cn: string
  level: number | null
  committed: { id: string; title: string; size: string }[]
  snow_total: number
  catch_net_pending: number
  last_gaze: { ts: string; note: string | null } | null
}

const API = '/tide'

async function tideFetch(path: string) {
  const res = await fetch(`${API}${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`http_${res.status}`)
  return res.json()
}

function fmtGazeTime(iso?: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const bj = new Date(d.getTime() + 8 * 3600 * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(bj.getUTCMonth() + 1)}/${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`
  } catch { return '' }
}

export function MoonPage({ onBack }: { onBack: (p: Page) => void }) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    try {
      const overview = await tideFetch('/stats/overview')
      if (mountedRef.current) { setData(overview); setError(false) }
    } catch {
      if (mountedRef.current) setError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="mp-page">
      <style>{MP_CSS}</style>
      <header className="mp-header">
        <button className="mp-back" onClick={() => onBack('tide')}>‹</button>
        <span className="mp-title">月相</span>
        <span />
      </header>

      {data?.last_gaze && (
        <div className="mp-gaze">苏煦上次来看你 · {fmtGazeTime(data.last_gaze.ts)}</div>
      )}

      {error && <div className="mp-empty">还连不上,稍后再看</div>}

      {data && (
        <div className="mp-grid">
          <div className="mp-tile">
            <span className="mp-tile-label">潮位</span>
            <span className="mp-tile-value">{data.level ?? '—'}</span>
          </div>
          <div className="mp-tile">
            <span className="mp-tile-label">今天的浪</span>
            <span className="mp-tile-value">{data.committed.length}/3</span>
          </div>
          <div className="mp-tile">
            <span className="mp-tile-label">海雪</span>
            <span className="mp-tile-value">❄️ {data.snow_total}</span>
          </div>
          <div className="mp-tile">
            <span className="mp-tile-label">捞网未清</span>
            <span className="mp-tile-value">{data.catch_net_pending}</span>
          </div>
        </div>
      )}

      {data && data.committed.length > 0 && (
        <div className="mp-list">
          {data.committed.map(w => (
            <div key={w.id} className="mp-list-item">{w.title}</div>
          ))}
        </div>
      )}
    </div>
  )
}

const MP_CSS = `
.mp-page { padding: 20px 16px 60px; max-width: 480px; margin: 0 auto; min-height: 100%; }
.mp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.mp-back { background: none; border: none; font-size: 24px; color: var(--ink-soft); cursor: pointer; padding: 4px 8px; }
.mp-title { font-family: var(--font-display); font-size: 20px; color: var(--ink); letter-spacing: 0.02em; }
.mp-gaze { text-align: center; font-size: 12px; color: var(--blue-deep); margin-bottom: 20px; }
.mp-empty { text-align: center; color: var(--ink-faint); font-size: 13px; padding: 30px 0; }
.mp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
.mp-tile {
  background: var(--panel-moon, var(--glass-bg)); border: 1px solid var(--glass-edge); border-radius: 16px;
  padding: 16px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--shadow-glass);
}
.mp-tile-label { font-size: 12px; color: var(--ink-soft); }
.mp-tile-value { font-size: 22px; color: var(--ink); font-family: var(--font-display); }
.mp-list { display: flex; flex-direction: column; gap: 8px; }
.mp-list-item {
  background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 12px;
  padding: 10px 14px; font-size: 14px; color: var(--ink);
}
`
