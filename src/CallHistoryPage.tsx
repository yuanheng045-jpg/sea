import { useState, useEffect, useRef, useCallback } from 'react'
import type { Page } from './App'
import { startCall } from './callStore'

// 通话记录页:读 /api/call/history,列出已结束 / 未接的通话
interface CallRecord {
  id: string
  channel: string
  reason: string | null
  source: string | null
  status: string
  created_at: string
  duration_s: number | null
  summary: string | null
}

// ISO → 北京时间 MM/DD HH:MM
function fmtWhen(iso?: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const bj = new Date(d.getTime() + 8 * 3600 * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(bj.getUTCMonth() + 1)}/${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`
  } catch { return '' }
}

function fmtDur(sec?: number | null): string {
  const s = Math.max(0, Math.floor(sec || 0))
  if (s < 60) return `${s}秒`
  const m = Math.floor(s / 60)
  const ss = s % 60
  return ss ? `${m}分${ss}秒` : `${m}分`
}

function chLabel(ch: string): string {
  return ch === 'cc' ? '主聊天' : ch === 'api' ? 'API 门' : (ch || '通话')
}

export function CallHistoryPage({ onBack }: { onBack: (p: Page) => void }) {
  const [items, setItems] = useState<CallRecord[] | null>(null)
  const [error, setError] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/call/history?limit=30', { credentials: 'include' })
      if (!r.ok) throw new Error('http_' + r.status)
      const data = await r.json()
      if (mountedRef.current) { setItems(Array.isArray(data) ? data : []); setError(false) }
    } catch {
      if (mountedRef.current) setError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = useCallback(async (id: string) => {
    if (!window.confirm('删除这条通话记录？')) return
    try {
      const r = await fetch('/api/call/history/delete', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const d = await r.json().catch(() => null)
      if (r.ok && d && d.ok && mountedRef.current) {
        setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev))
      }
    } catch {}
  }, [])

  return (
    <div className="ch-page">
      <style>{CH_CSS}</style>
      <header className="ch-header">
        <button className="ch-back" onClick={() => onBack('home')}>‹</button>
        <span className="ch-title">通话</span>
        <span />
      </header>

      <section className="ch-dial">
        <button className="ch-dial-btn" onClick={() => { void startCall('cc', null) }}>
          <CallPhoneSvg />
        </button>
        <div className="ch-dial-label">打给苏煦</div>
      </section>
      <div className="ch-section-title">通话记录</div>

      {error ? (
        <div className="ch-empty">还连不上,稍后再看</div>
      ) : items === null ? (
        <div className="ch-empty">载入中…</div>
      ) : items.length === 0 ? (
        <div className="ch-empty">还没有通话记录</div>
      ) : (
        <div className="ch-list">
          {items.map((c) => {
            const missed = c.status !== 'ended'
            return (
              <div key={c.id} className={`ch-item${missed ? ' ch-missed' : ''}`}>
                <div className="ch-line">
                  <span className="ch-icon">📞</span>
                  {c.status === 'ended' ? (
                    <span className="ch-meta">{chLabel(c.channel)} · {fmtDur(c.duration_s)}</span>
                  ) : c.status === 'declined' ? (
                    <span className="ch-meta">未接 · {chLabel(c.channel)}</span>
                  ) : (
                    <span className="ch-meta">未接来电{c.reason ? ' · ' + c.reason : ''}</span>
                  )}
                  <span className="ch-when">{fmtWhen(c.created_at)}</span>
                  <button className="ch-del" onClick={() => { void remove(c.id) }} aria-label="删除" title="删除">✕</button>
                </div>
                {c.status === 'ended' && c.summary ? (
                  <div className="ch-summary">{c.summary}</div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CallPhoneSvg() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

const CH_CSS = `
.ch-page { padding: 0 16px 60px; max-width: 480px; margin: 0 auto; min-height: 100%; }
.ch-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.ch-back { background: none; border: none; font-size: 24px; color: var(--ink-soft); cursor: pointer; padding: 4px 8px; line-height: 1; }
.ch-title { font-family: var(--font-display); font-size: 20px; color: var(--ink); letter-spacing: 0.02em; }
.ch-dial { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 8px 0 24px; }
.ch-dial-btn {
  width: 62px; height: 62px; border-radius: 50%; border: 1px solid oklch(0.62 0.13 256 / 0.35);
  display: flex; align-items: center; justify-content: center; color: #5f8fe6; cursor: pointer;
  background: linear-gradient(160deg, rgba(120,165,235,0.24), rgba(90,135,215,0.10)), var(--glass-bg);
  box-shadow: var(--shadow-glass); transition: transform 0.16s ease, opacity 0.16s ease;
}
.ch-dial-btn:active { transform: scale(0.94); }
.ch-dial-label { font-family: var(--font-body); font-size: 13px; color: var(--ink-soft); }
.ch-section-title { margin: 0 2px 8px; font-family: var(--font-display); font-size: 14px; color: var(--ink-faint); letter-spacing: 0.06em; }
.ch-empty { text-align: center; color: var(--ink-faint); font-size: 13px; padding: 40px 0; }
.ch-list { display: flex; flex-direction: column; gap: 8px; }
.ch-item {
  background: var(--glass-bg); border: 1px solid var(--glass-edge); border-radius: 14px;
  padding: 12px 14px; box-shadow: var(--shadow-glass);
  display: flex; flex-direction: column; gap: 6px;
}
.ch-missed { opacity: 0.82; }
.ch-line { display: flex; align-items: center; gap: 8px; }
.ch-icon { font-size: 14px; flex: 0 0 auto; }
.ch-missed .ch-icon { filter: grayscale(0.5); opacity: 0.7; }
.ch-meta { flex: 1 1 auto; min-width: 0; font-family: var(--font-body); font-size: 14px; color: var(--ink); }
.ch-missed .ch-meta { color: var(--ink-soft); }
.ch-when { flex: 0 0 auto; font-size: 11.5px; color: var(--ink-faint); font-variant-numeric: tabular-nums; letter-spacing: 0.03em; }
.ch-summary { font-family: var(--font-body); font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; padding-left: 22px; }
.ch-del { flex: 0 0 auto; background: none; border: none; color: var(--ink-faint); font-size: 13px; line-height: 1; padding: 2px 4px; margin-left: 2px; cursor: pointer; opacity: 0.5; transition: opacity 0.15s ease, color 0.15s ease; }
.ch-del:hover { opacity: 1; color: var(--ink-soft); }
`
