import { useEffect, useState, useRef, useCallback } from 'react'
import './memory.css'

const API = '/api/mem2'

type Card = {
  card_id: string; card_text: string; tags: string[]; inject_count: number
  last_injected_at: string | null; reviewed: boolean
  fragment_id: string; speaker: string; said_at: string; heat: number; status: string
  episode_id: string; gist: string; gate: string
}
type Status = 'active' | 'archived' | 'sealed'

const SPK: Record<string, string> = { yuanyao: '原瑶', suxu: '苏煦', mixed: '对话' }
const cnDate = (ts?: string | null) => {
  if (!ts) return ''
  try { return new Date(new Date(ts).getTime() + 8 * 3600e3).toISOString().slice(0, 10) } catch { return '' }
}
const STATUS_CN: Record<Status, string> = { active: '在库', archived: '归档', sealed: '封存' }

export function MemoryPage({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<any>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('active')
  const [items, setItems] = useState<Card[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [episode, setEpisode] = useState<any>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const qTimer = useRef<number | null>(null)

  const loadStats = useCallback(() => {
    fetch(`${API}/browse/stats`).then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  const load = useCallback((reset: boolean, query: string, st: Status, offset: number) => {
    setLoading(true)
    fetch(`${API}/browse/cards?q=${encodeURIComponent(query)}&status=${st}&offset=${offset}&limit=30`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error || '加载失败')
        setItems(prev => (reset ? d.items : [...prev, ...d.items]))
        setHasMore(d.has_more)
        setErr('')
      })
      .catch(e => setErr(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadStats(); load(true, '', 'active', 0) }, [loadStats, load])

  const onSearch = (v: string) => {
    setQ(v)
    if (qTimer.current) window.clearTimeout(qTimer.current)
    qTimer.current = window.setTimeout(() => load(true, v, status, 0), 400)
  }
  const onTab = (st: Status) => {
    setStatus(st); setOpenId(null); setDetail(null); setEpisode(null)
    load(true, q, st, 0)
  }
  const openCard = (c: Card) => {
    if (openId === c.fragment_id) { setOpenId(null); setDetail(null); setEpisode(null); setConfirming(null); return }
    setOpenId(c.fragment_id); setDetail(null); setEpisode(null); setConfirming(null)
    fetch(`${API}/browse/fragment/${c.fragment_id}`).then(r => r.json())
      .then(d => { if (d.ok) setDetail(d.fragment) })
      .catch(() => {})
  }
  const openEpisode = (epId: string) => {
    if (episode) { setEpisode(null); return }
    fetch(`${API}/browse/episode/${epId}`).then(r => r.json())
      .then(d => { if (d.ok) setEpisode(d) })
      .catch(() => {})
  }
  const act = (fragId: string, to: Status) => {
    const key = `${fragId}:${to}`
    if (confirming !== key) { setConfirming(key); return }
    setConfirming(null)
    fetch(`${API}/manage/fragment/${fragId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: to, actor: 'yuanyao' }),
    }).then(r => r.json()).then(d => {
      if (!d.ok) { setErr(d.error || '操作失败'); return }
      setItems(prev => prev.filter(i => i.fragment_id !== fragId))
      setOpenId(null); setDetail(null); setEpisode(null)
      loadStats()
    }).catch(e => setErr(String(e?.message || e)))
  }

  const actBtn = (fragId: string, to: Status, label: string) => (
    <button
      key={to}
      className={`mem-act${confirming === `${fragId}:${to}` ? ' confirm' : ''}`}
      onClick={() => act(fragId, to)}
    >{confirming === `${fragId}:${to}` ? `再点一次·${label}` : label}</button>
  )

  return (
    <div className="status-page mem-page">
      <div className="st-inner">
        <header className="st-header">
          <button className="st-back" onClick={onBack} aria-label="返回">‹</button>
          <div className="st-title-wrap">
            <h2 className="st-title">Memory</h2>
            <span className="st-subtitle">记忆库 · 卡 → 碎片 → 情节 → 原文</span>
          </div>
          <button className={`st-refresh${loading ? ' spin' : ''}`} onClick={() => { loadStats(); load(true, q, status, 0) }} aria-label="刷新">⟳</button>
        </header>

        {stats && (
          <div className="mem-stats">
            <span><b>{stats.episodes}</b> 情节</span>
            <span><b>{stats.fragments_active}</b> 碎片</span>
            <span><b>{stats.cards}</b> 卡片</span>
            <span><b>{stats.injected_24h}</b> 今日浮起</span>
          </div>
        )}

        <div className="mem-controls st-card">
          <input
            className="mem-search"
            value={q}
            onChange={e => onSearch(e.target.value)}
            placeholder="搜记忆（原话 / 背景）…"
          />
          <div className="mem-tabs">
            {(['active', 'archived', 'sealed'] as Status[]).map(st => (
              <button key={st} className={`mem-tab${status === st ? ' on' : ''}`} onClick={() => onTab(st)}>
                {STATUS_CN[st]}
              </button>
            ))}
          </div>
        </div>

        {err && <div className="st-meta st-err">{err}</div>}

        <div className="mem-list">
          {items.map(c => (
            <div key={c.card_id} className={`st-card mem-item${openId === c.fragment_id ? ' open' : ''}`}>
              <div className="mem-item-main" onClick={() => openCard(c)}>
                <div className="mem-card-text">{c.card_text}</div>
                <div className="mem-meta">
                  <span>{cnDate(c.said_at)}</span>
                  <span>{SPK[c.speaker] || c.speaker}</span>
                  {c.inject_count > 0 && <span className="mem-inj">浮起 ×{c.inject_count}</span>}
                  {c.heat > 1.05 && <span className="mem-heat">热 {Number(c.heat).toFixed(1)}</span>}
                </div>
                {c.gist && <div className="mem-gist">{c.gist}</div>}
              </div>

              {openId === c.fragment_id && (
                <div className="mem-detail">
                  {!detail && <div className="mem-dim">载入中…</div>}
                  {detail && (
                    <>
                      <div className="mem-quote-label">碎片原话（逐字 · 只读）</div>
                      <blockquote className="mem-quote">{detail.quote}</blockquote>
                      <div className="mem-meta">
                        <span>{cnDate(detail.said_at)}</span>
                        <span>{SPK[detail.speaker] || detail.speaker}</span>
                        <span>{detail.gate === 'cc' ? 'CC门' : detail.gate === 'api' ? 'API门' : detail.gate}</span>
                        {detail.sealed_by && <span>封存人 {detail.sealed_by}</span>}
                      </div>
                      <div className="mem-actions">
                        <button className="mem-act" onClick={() => openEpisode(c.episode_id)}>
                          {episode ? '收起当时对话' : '看当时对话'}
                        </button>
                        {status !== 'active' && actBtn(c.fragment_id, 'active', '恢复')}
                        {status !== 'archived' && actBtn(c.fragment_id, 'archived', '归档')}
                        {status !== 'sealed' && actBtn(c.fragment_id, 'sealed', '封存')}
                      </div>
                      {episode && (
                        <div className="mem-episode">
                          <div className="mem-quote-label">情节 · {episode.episode.gist}</div>
                          <div className="mem-timeline">
                            {episode.events.map((e: any, i: number) => (
                              <div key={i} className={`mem-ev${e.speaker === '原瑶' ? ' yy' : ''}`}>
                                <span className="mem-ev-head">{e.time} · {e.speaker}</span>
                                <span className="mem-ev-text">{e.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && items.length === 0 && <div className="mem-dim mem-empty">这里还没有{STATUS_CN[status]}的记忆</div>}
        </div>

        {hasMore && (
          <button className="mem-more" disabled={loading} onClick={() => load(false, q, status, items.length)}>
            {loading ? '载入中…' : '再往下翻'}
          </button>
        )}
      </div>
    </div>
  )
}
