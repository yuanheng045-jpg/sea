import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MC_API = 'https://puppy.atlantis-sy.blue/nm'
const MC_AUTH = 'nm_a8f3e2d1c7b94056'

type Song = { id: string; name: string; artist: string; pic: string }

export function SongPicker({ onClose, onPick }: { onClose: () => void; onPick: (tag: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const search = async () => {
    const query = q.trim()
    if (!query) return
    setLoading(true); setErr(null)
    try {
      const r = await fetch(MC_API + '/api/music/search2?q=' + encodeURIComponent(query), { headers: { Authorization: 'Bearer ' + MC_AUTH } })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      const arr: Song[] = (Array.isArray(d) ? d : []).map((s: any) => ({ id: String(s.id), name: s.name || '', artist: s.artist || '', pic: s.pic || '' }))
      setResults(arr)
    } catch { setErr('搜索失败，再试一次'); setResults([]) }
    finally { setLoading(false) }
  }

  const pick = (s: Song) => { onPick('[music:' + s.id + ':' + s.name + ':' + s.artist + ':' + s.pic + ']') }

  return createPortal(
    <div className="sp-backdrop" onClick={onClose}>
      <div className="sp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sp-head">
          <span className="sp-title">点歌 · 分享给苏煦</span>
          <button className="sp-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="sp-search">
          <input ref={inputRef} className="sp-input" value={q} placeholder="搜歌名 / 歌手"
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search() }} />
          <button className="sp-go" onClick={search} disabled={loading}>{loading ? '…' : '搜'}</button>
        </div>
        <div className="sp-results">
          {err && <div className="sp-empty">{err}</div>}
          {!err && !loading && results.length === 0 && <div className="sp-empty">搜一首歌，选中就分享给她</div>}
          {results.map((s) => (
            <button key={s.id} className="sp-item" onClick={() => pick(s)}>
              {s.pic
                ? <img className="sp-cover" src={s.pic} alt="" referrerPolicy="no-referrer" />
                : <span className="sp-cover sp-cover-none">♪</span>}
              <span className="sp-meta">
                <span className="sp-name">{s.name}</span>
                <span className="sp-artist">{s.artist}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
