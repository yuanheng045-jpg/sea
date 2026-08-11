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
interface Unlockable {
  id: string
  threshold: number
  title: string
  has_content: boolean
  opened_at: string | null
  can_open: boolean
}

const API = '/tide'

async function tideFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  })
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
  const [shells, setShells] = useState<Unlockable[]>([])
  const [openedContent, setOpenedContent] = useState<Record<string, string>>({})
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
    try {
      const u = await tideFetch('/unlockables')
      if (mountedRef.current) setShells(u.unlockables)
    } catch { /* 解锁库拉不到不挡月相页 */ }
  }, [])

  useEffect(() => { load() }, [load])

  // 亲手点开贝壳(或重看已开过的)
  const openShell = useCallback(async (id: string) => {
    try {
      const row = await tideFetch(`/unlockables/${id}/open`, {
        method: 'POST',
        body: JSON.stringify({ request_id: `open-${id}-${Date.now()}` }),
      })
      if (!mountedRef.current) return
      if (row && row.content) setOpenedContent(prev => ({ ...prev, [id]: row.content }))
      load()
    } catch { /* 开不了就保持原样,不弹错误 */ }
  }, [load])

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

      {shells.length > 0 && (
        <div className="mp-shells">
          <h3 className="mp-sec-title">海底</h3>
          {shells.map(u => {
            const openable = u.can_open || (u.opened_at != null && u.has_content)
            return (
              <div key={u.id} className={`mp-shell${openable ? ' mp-shell-open' : ''}`}>
                <button
                  className="mp-shell-row"
                  disabled={!openable}
                  onClick={() => openShell(u.id)}
                >
                  <span className="mp-shell-icon">{u.opened_at ? '🐚' : openable ? '🦪' : '·'}</span>
                  <span className="mp-shell-title">{u.title}</span>
                  <span className="mp-shell-meta">
                    {!u.has_content ? '还沉在海底' : u.opened_at ? '看看' : u.can_open ? '打开' : `❄️ ${u.threshold}`}
                  </span>
                </button>
                {openedContent[u.id] && (
                  <p className="mp-shell-content">{openedContent[u.id]}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const MP_CSS = `
.mp-page { padding: 0 16px 60px; max-width: 480px; margin: 0 auto; min-height: 100%; }
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
.mp-shells { margin-top: 24px; }
.mp-sec-title { font-size: 14px; color: var(--ink-soft); font-weight: 500; margin: 0 0 10px 2px; }
.mp-shell {
  background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 12px;
  margin-bottom: 8px; overflow: hidden;
}
.mp-shell-row {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px;
  background: none; border: none; text-align: left; cursor: default; font-size: 14px;
}
.mp-shell-open .mp-shell-row { cursor: pointer; }
.mp-shell-icon { flex-shrink: 0; width: 20px; text-align: center; color: var(--ink-faint); }
.mp-shell-title { flex: 1; color: var(--ink); }
.mp-shell-meta { font-size: 12px; color: var(--ink-faint); flex-shrink: 0; }
.mp-shell-open .mp-shell-meta { color: var(--blue-deep); }
.mp-shell-content {
  margin: 0; padding: 4px 14px 14px 44px; font-size: 14px; color: var(--ink);
  white-space: pre-wrap; line-height: 1.7;
}
`
