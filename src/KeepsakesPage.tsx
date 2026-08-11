import { useEffect, useState } from 'react'
import type { Page } from './App'

type Keepsake = {
  id: string
  title?: string
  words: string
  page_url: string
  image_url: string
  price_snapshot?: string
  observed_at: string
  source: 'main-chat' | 'group-chat'
}

const API = '/group'

export function KeepsakesPage({ onBack }: { onBack: (page: Page) => void }) {
  const [cards, setCards] = useState<Keepsake[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (next = '') => {
    setLoading(true); setError('')
    try {
      const pin = localStorage.getItem('sea-channel-pin') || ''
      await fetch(`${API}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }), credentials: 'same-origin' })
      const response = await fetch(`${API}/keepsakes?limit=24${next ? `&cursor=${encodeURIComponent(next)}` : ''}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(response.status === 401 ? '先回主聊天登录一下' : '册子暂时打不开')
      const data = await response.json()
      setCards(previous => next ? [...previous, ...(data.cards || [])] : (data.cards || []))
      setCursor(data.next_cursor || null)
    } catch (e) { setError(e instanceof Error ? e.message : '册子暂时打不开') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="ks-page">
      <style>{KS_CSS}</style>
      <header className="ks-top">
        <button onClick={() => onBack('home')} aria-label="返回">‹</button>
        <div><h1>拾 贝</h1><p>苏煦从网络的海里捡回来的</p></div>
        <span />
      </header>
      <main className="ks-feed">
        {!loading && !error && cards.length === 0 && <div className="ks-empty">第一枚贝壳还在路上</div>}
        {cards.map(card => {
          const day = new Date(card.observed_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
          return (
            <article className="ks-card" key={card.id}>
              <a href={card.page_url} target="_blank" rel="noreferrer"><img src={card.image_url} alt={card.title || '苏煦捡回来的东西'} loading="lazy" /></a>
              <div className="ks-body">
                <div className="ks-meta"><time>{day}</time><span>{card.source === 'main-chat' ? '主聊天' : '客厅'}</span></div>
                {card.title && <h2>{card.title}</h2>}
                <p>{card.words}</p>
                <div className="ks-foot">
                  <span>{card.price_snapshot ? `当时看到 · ${card.price_snapshot}` : '留住这一眼'}</span>
                  <a href={card.page_url} target="_blank" rel="noreferrer">去看看 ↗</a>
                </div>
              </div>
            </article>
          )
        })}
        {error && <div className="ks-empty">{error}<button onClick={() => load(cursor || '')}>再试一次</button></div>}
        {cursor && !error && <button className="ks-more" disabled={loading} onClick={() => load(cursor)}>{loading ? '翻页中…' : '再翻一页'}</button>}
        {loading && cards.length === 0 && <div className="ks-empty">正在翻开册子…</div>}
      </main>
    </div>
  )
}

const KS_CSS = `
.ks-page{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;background:linear-gradient(180deg,rgba(250,247,240,.38),rgba(241,235,223,.16));color:var(--ink,#4a463e)}
.ks-top{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:calc(env(safe-area-inset-top) + 8px) 10px 10px;background:rgba(249,246,239,.9);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid rgba(160,140,105,.1)}
.ks-top button{width:40px;height:40px;border:0;border-radius:12px;background:transparent;color:var(--ink-soft,#8a8478);font-size:27px}
.ks-top h1{margin:0;text-align:center;font-family:var(--font-display,serif);font-size:17px;font-weight:500;letter-spacing:.28em;color:#89765a}
.ks-top p{margin:3px 0 0;text-align:center;font-size:10.5px;letter-spacing:.08em;color:var(--ink-faint,#aaa294)}
.ks-feed{width:min(100%,760px);margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.ks-card{overflow:hidden;border-radius:20px;background:rgba(255,253,248,.8);border:1px solid rgba(174,151,112,.18);box-shadow:0 14px 40px rgba(82,68,45,.08)}
.ks-card>a{display:block}.ks-card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:rgba(160,145,120,.08)}
.ks-body{padding:13px 15px 15px}.ks-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10.5px;color:var(--ink-faint,#a49d91)}
.ks-meta span{color:#a68b62}.ks-card h2{margin:9px 0 0;font-size:15px;font-weight:600;color:var(--ink,#4a463e)}
.ks-card p{margin:8px 0 0;font-size:14px;line-height:1.75;white-space:pre-wrap;color:var(--ink,#4a463e)}
.ks-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:11px;font-size:10.5px;color:var(--ink-faint,#9d968b)}
.ks-foot a{flex:none;color:#9b7e54;text-decoration:none;font-size:11.5px}
.ks-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:12px;padding:20vh 20px;color:var(--ink-faint,#a49d91);font-size:13px}
.ks-empty button,.ks-more{border:1px solid rgba(174,151,112,.25);border-radius:999px;background:rgba(255,253,248,.75);padding:9px 18px;color:#907652;font-family:inherit}
.ks-more{grid-column:1/-1;justify-self:center;margin:4px 0 10px}
@media(max-width:620px){.ks-feed{grid-template-columns:1fr;padding-left:14px;padding-right:14px}.ks-card{border-radius:18px}.ks-card img{max-height:420px}}
`
