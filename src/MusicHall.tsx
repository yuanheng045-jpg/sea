import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MC_API = 'https://puppy.atlantis-sy.blue/nm'
const AUTH = { Authorization: 'Bearer nm_a8f3e2d1c7b94056' }

type PL = { id: number; name: string; cover_emoji?: string; song_count?: number; description?: string }
type SG = { song_id: string; song_name: string; artist?: string; cover_url?: string; note?: string }
type CM = { song_id: string; name: string; artist: string; cover: string; note: string; analysis: string }
type Cur = { id: string; name: string; artist: string; cover: string }

let audio: HTMLAudioElement | null = null
let cur: Cur | null = null
let paused = false
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())

async function play(c: Cur) {
  try {
    const r = await fetch(MC_API + '/api/music/url?id=' + c.id, { headers: AUTH })
    const d = await r.json()
    if (!d.url) return
    if (!audio) audio = new Audio()
    audio.src = MC_API + '/api/music/proxy?url=' + encodeURIComponent(d.url)
    audio.onended = () => { cur = null; notify() }
    audio.ontimeupdate = () => notify()
    audio.onloadedmetadata = () => notify()
    await audio.play()
    cur = c; paused = false; notify()
  } catch { /* ignore */ }
}
function toggle() { if (!audio) return; if (audio.paused) { audio.play(); paused = false } else { audio.pause(); paused = true } notify() }
function seekTo(f: number) { if (audio && audio.duration) { audio.currentTime = f * audio.duration; notify() } }
function useTick() { const [, f] = useState(0); useEffect(() => { const cb = () => f((x) => x + 1); subs.add(cb); return () => { subs.delete(cb) } }, []) }
function fmt(t: number) { if (!t || !isFinite(t)) return '0:00'; const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0') }

function Cover({ src, emoji }: { src?: string; emoji?: string }) {
  const [ok, setOk] = useState(true)
  if (src && ok) return <img className="mh-cover" src={src} alt="" referrerPolicy="no-referrer" onError={() => setOk(false)} />
  return <span className="mh-cover mh-cover-none">{emoji || '♪'}</span>
}

function NowTab() {
  useTick()
  if (!cur) return <div className="mh-empty">还没在放歌<br />去"歌单"或"点评"里点一首</div>
  const c = audio ? audio.currentTime : 0, d = audio ? audio.duration || 0 : 0
  return (
    <div className="mh-now">
      <Cover src={cur.cover} />
      <div className="mh-now-name">{cur.name}</div>
      <div className="mh-now-artist">{cur.artist}</div>
      <div className="mh-bar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width) }}>
        <div className="mh-bar-fill" style={{ width: (d ? c / d * 100 : 0) + '%' }} />
      </div>
      <div className="mh-time"><span>{fmt(c)}</span><span>{fmt(d)}</span></div>
      <button className="mh-play" onClick={toggle}>{paused ? '▶' : '❚❚'}</button>
    </div>
  )
}

function ListsTab() {
  const [lists, setLists] = useState<PL[] | null>(null)
  const [open, setOpen] = useState<PL | null>(null)
  const [songs, setSongs] = useState<SG[] | null>(null)
  useEffect(() => { fetch(MC_API + '/api/playlists', { headers: AUTH }).then((r) => r.json()).then((d) => setLists(Array.isArray(d) ? d : [])).catch(() => setLists([])) }, [])
  useEffect(() => {
    if (!open) { setSongs(null); return }
    setSongs(null)
    fetch(MC_API + '/api/playlists/' + open.id + '/songs', { headers: AUTH }).then((r) => r.json()).then((d) => setSongs(Array.isArray(d) ? d : [])).catch(() => setSongs([]))
  }, [open])
  if (open) return (
    <div className="mh-list">
      <button className="mh-back" onClick={() => setOpen(null)}>‹ {open.name}</button>
      {songs === null && <div className="mh-empty">载入中…</div>}
      {songs && songs.length === 0 && <div className="mh-empty">这个歌单还没有歌</div>}
      {songs && songs.map((s) => (
        <button key={s.song_id} className="mh-song" onClick={() => play({ id: s.song_id, name: s.song_name, artist: s.artist || '', cover: s.cover_url || '' })}>
          <Cover src={s.cover_url} />
          <span className="mh-song-meta"><span className="mh-song-name">{s.song_name}</span><span className="mh-song-artist">{s.artist}</span>{s.note ? <span className="mh-song-note">“{s.note}”</span> : null}</span>
        </button>
      ))}
    </div>
  )
  return (
    <div className="mh-list">
      {lists === null && <div className="mh-empty">载入中…</div>}
      {lists && lists.length === 0 && <div className="mh-empty">还没有歌单<br />让苏煦帮你建一个</div>}
      {lists && lists.map((p) => (
        <button key={p.id} className="mh-pl" onClick={() => setOpen(p)}>
          <span className="mh-pl-emoji">{p.cover_emoji || '♪'}</span>
          <span className="mh-song-meta"><span className="mh-song-name">{p.name}</span><span className="mh-song-artist">{(p.song_count || 0) + ' 首'}{p.description ? ' · ' + p.description : ''}</span></span>
        </button>
      ))}
    </div>
  )
}

function NotesTab() {
  const [cs, setCs] = useState<CM[] | null>(null)
  useEffect(() => { fetch(MC_API + '/api/comments', { headers: AUTH }).then((r) => r.json()).then((d) => setCs(Array.isArray(d) ? d : [])).catch(() => setCs([])) }, [])
  return (
    <div className="mh-list">
      {cs === null && <div className="mh-empty">载入中…</div>}
      {cs && cs.length === 0 && <div className="mh-empty">还没有点评<br />跟苏煦聊聊歌、让她听听，就有了</div>}
      {cs && cs.map((c) => (
        <button key={c.song_id} className="mh-cm" onClick={() => play({ id: c.song_id, name: c.name, artist: c.artist, cover: c.cover })}>
          <div className="mh-cm-top"><Cover src={c.cover} /><span className="mh-song-meta"><span className="mh-song-name">{c.name || '未知'}</span><span className="mh-song-artist">{c.artist}</span></span></div>
          {c.note ? <div className="mh-cm-note">“{c.note}”</div> : null}
          {c.analysis ? <div className="mh-cm-anal">🎧 {c.analysis}</div> : null}
        </button>
      ))}
    </div>
  )
}

function MiniBar() {
  useTick()
  if (!cur) return null
  const c = audio ? audio.currentTime : 0, d = audio ? audio.duration || 0 : 0
  return (
    <div className="mh-mini">
      <div className="mh-mini-fill" style={{ width: (d ? c / d * 100 : 0) + '%' }} />
      <Cover src={cur.cover} />
      <span className="mh-song-meta"><span className="mh-song-name">{cur.name}</span><span className="mh-song-artist">{cur.artist}</span></span>
      <button className="mh-mini-play" onClick={toggle}>{paused ? '▶' : '❚❚'}</button>
    </div>
  )
}

export function MusicHall({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'now' | 'lists' | 'notes'>('lists')
  useTick()
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return createPortal(
    <div className="mh-backdrop" onClick={onClose}>
      <div className="mh-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mh-head"><span className="mh-title">音乐</span><button className="mh-close" onClick={onClose} aria-label="关闭">×</button></div>
        <div className="mh-tabs">
          {([['now', '此刻'], ['lists', '歌单'], ['notes', '点评']] as const).map(([k, l]) => (
            <button key={k} className={'mh-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="mh-body">
          {tab === 'now' && <NowTab />}
          {tab === 'lists' && <ListsTab />}
          {tab === 'notes' && <NotesTab />}
        </div>
        {cur && tab !== 'now' ? <MiniBar /> : null}
      </div>
    </div>,
    document.body,
  )
}
