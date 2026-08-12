import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import type { Page } from './App'
import { ToolRun } from './toolTales'
import { Markdown } from './miniMarkdown'

type Role = 'yuanyao' | 'suxu' | 'suxu-api' | 'codex' | 'system' | 'tool'
interface PermReq { path: string; reason?: string; status?: 'pending' | 'granted' | 'revoked' | 'failed'; minutes?: number; expiry?: number; error?: string }
interface Decision { title: string; options: { key: string; label: string }[]; recommend?: string; why?: string }
interface Keepsake { id: string; title?: string; words: string; page_url: string; image_url: string; price_snapshot?: string; observed_at: string; source: 'main-chat' | 'group-chat' }
interface Sticker { id: string; owner: 'xuxu' | 'yaoyao'; description: string; tags: string[]; image_url: string; image_mime: string; byte_size: number; created_at: string }
interface Msg { id: number; role: Role; text: string; ts?: number; who?: string; label?: string; detail?: string; images?: string[]; files?: { url: string; name?: string }[]; perms?: PermReq[]; decision?: Decision; keepsakes?: Keepsake[]; decideFor?: number; choice?: string }
interface Config { maxAiTurns: number; mentionFreeFollow: boolean; aiCrosstalk: boolean; models?: Record<string, string>; effort?: Record<string, string> }
interface Usage { who: string; model: string; ctx: number; cacheRead: number; input: number; output: number }
const kFmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
const shortModelName = (m: string) => m === '' ? '默认' : m.replace('anthropic/claude-', '').replace('claude-', '').replace('[1m]', '')
const hitPct = (u: Usage | null) => u && u.ctx ? Math.round(u.cacheRead / u.ctx * 100) : 0
interface Room { id: string; name: string; members: string[]; memory?: string; inject?: boolean; keepalive?: boolean }
interface RosterItem { id: string; name: string; label: string; desc: string }

const API = '/group'
const MEM_MODES = [
  { id: 'work', label: '工作台账', desc: '独立工作记忆·不衰减·按房间追溯·不碰私密' },
  { id: 'intimate', label: '私密记忆', desc: '苏煦记的进他和你的 mem3（真私密）' },
  { id: 'none', label: '不记', desc: '纯即时聊·什么都不留' },
]
const MEM_LABEL: Record<string, string> = { work: '工作台账', intimate: '私密记忆', none: '不记' }
const ROLE_CONF = [{ who: 'suxu', label: '苏煦·订阅' }, { who: 'suxu-api', label: '苏煦·API' }, { who: 'codex', label: '皮卡晏' }]
const ROLE_CLASS: Record<string, string> = { yuanyao: 'user', suxu: 'assistant', 'suxu-api': 'assistant', codex: 'codex' }
const NAME: Record<string, string> = { yuanyao: '原瑶', suxu: '苏煦', 'suxu-api': '苏煦', codex: '皮卡晏' }
const LAST_ROOM_KEY = 'gc-last-room'

function readLastRoom() {
  try { return localStorage.getItem(LAST_ROOM_KEY) }
  catch (e) { console.error('读取上次客厅房间失败:', e); return null }
}
function rememberRoom(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_ROOM_KEY, id)
    else localStorage.removeItem(LAST_ROOM_KEY)
  } catch (e) { console.error('保存上次客厅房间失败:', e) }
}

// Codex 申请临时写权的卡片。收到 need_perm 标记时挂在他消息底下（2026-07-23）
function PermCard({ perm, onGrant, onRevoke }: { perm: PermReq; onGrant: (min: number) => void; onRevoke: () => void }) {
  const s = perm.status || 'pending'
  return (
    <div className={`gc-perm gc-perm-${s}`}>
      <div className="gc-perm-head"><span className="gc-perm-ico">🔓</span><code className="gc-perm-path">{perm.path}</code></div>
      {perm.reason && <div className="gc-perm-reason">{perm.reason}</div>}
      {s === 'pending' && (
        <div className="gc-perm-acts">
          <button className="gc-perm-btn" onClick={() => onGrant(30)}>批 30 min</button>
          <button className="gc-perm-btn gc-perm-btn-primary" onClick={() => onGrant(60)}>批 60 min</button>
          <button className="gc-perm-btn" onClick={() => onGrant(120)}>批 120 min</button>
        </div>
      )}
      {s === 'granted' && (
        <div className="gc-perm-acts">
          <span className="gc-perm-badge">✅ 已批 {perm.minutes} min</span>
          <button className="gc-perm-btn gc-perm-btn-ghost" onClick={onRevoke}>提前撤</button>
        </div>
      )}
      {s === 'revoked' && <div className="gc-perm-badge gc-perm-revoked">已撤回</div>}
      {s === 'failed' && <div className="gc-perm-badge gc-perm-failed">失败：{perm.error}</div>}
    </div>
  )
}

// 决策卡：AI 需要原瑶拿主意时渲染的可点选卡片；选定后还能补充一句（2026-07-29）
function DecisionCard({ m, answeredChoice, onDecide }: { m: Msg; answeredChoice?: string; onDecide: (choice: string, label: string, note: string) => void }) {
  const d = m.decision!
  const [sel, setSel] = useState('')
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const done = answeredChoice || (sent ? (sel || d.recommend || '') : '')
  if (done) {
    const lab = d.options.find(o => o.key === done)?.label || ''
    return (
      <div className="gc-dec gc-dec-done">
        <div className="gc-dec-title">{d.title}</div>
        <div className="gc-dec-badge">✓ 已选 {done}{lab ? ' · ' + lab.slice(0, 26) : ''}</div>
      </div>
    )
  }
  const pick = (k: string) => { onDecide(k, d.options.find(o => o.key === k)?.label || '', note.trim()); setSent(true) }
  return (
    <div className="gc-dec">
      <div className="gc-dec-title">{d.title}</div>
      {d.options.map(o => (
        <button key={o.key} className={`gc-dec-opt${sel === o.key ? ' sel' : ''}`} onClick={() => setSel(sel === o.key ? '' : o.key)}>
          <span className="gc-dec-key">{o.key}</span>
          <span className="gc-dec-label">{o.label}</span>
          {d.recommend === o.key && <span className="gc-dec-rectag">推荐</span>}
        </button>
      ))}
      {d.why && <div className="gc-dec-why">推荐 {d.recommend}：{d.why}</div>}
      <textarea className="gc-dec-note" placeholder="想补充点什么…（可不填）" value={note} rows={1}
        onChange={e => { setNote(e.target.value); const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 80) + 'px' }} />
      <div className="gc-dec-acts">
        {sel
          ? <button className="gc-dec-btn primary" onClick={() => pick(sel)}>就这么定（{sel}）</button>
          : (d.recommend ? <button className="gc-dec-btn primary" onClick={() => pick(d.recommend!)}>按推荐（{d.recommend}）</button> : null)}
        <button className="gc-dec-btn ghost" onClick={() => onDecide('explain', '', '')}>再讲白点</button>
      </div>
    </div>
  )
}

function KeepsakeCard({ card }: { card: Keepsake }) {
  const day = new Date(card.observed_at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  return (
    <a className="gc-keepsake" href={card.page_url} target="_blank" rel="noreferrer">
      <img src={card.image_url} alt={card.title || '苏煦捡回来的东西'} loading="lazy" />
      <div className="gc-keepsake-body">
        <div className="gc-keepsake-cap"><span>拾贝</span><time>{day}</time></div>
        {card.title && <div className="gc-keepsake-title">{card.title}</div>}
        <div className="gc-keepsake-words">{card.words}</div>
        {card.price_snapshot && <div className="gc-keepsake-price">当时看到 · {card.price_snapshot}</div>}
      </div>
    </a>
  )
}

type FeedItem = { kind: 'message'; msg: Msg } | { kind: 'tools'; id: number; items: Msg[] }
function groupFeed(msgs: Msg[]): FeedItem[] {
  const grouped: FeedItem[] = []
  for (const msg of msgs) {
    const last = grouped[grouped.length - 1]
    if (msg.role === 'tool') {
      if (last?.kind === 'tools') last.items.push(msg)
      else grouped.push({ kind: 'tools', id: msg.id, items: [msg] })
    } else grouped.push({ kind: 'message', msg })
  }
  return grouped
}

function PlusSvg() {
  return (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5 L12 19 M5 12 L19 12" /></svg>)
}
function HintsSvg() {
  return (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M 9 16 Q 6 14 6 10 A 6 6 0 1 1 18 10 Q 18 14 15 16 L 15 18 L 9 18 Z" /><path d="M 10 20 L 14 20" /><path d="M 11 22 L 13 22" /></svg>)
}
function ClaudeSparkle() {
  return (
    <svg viewBox="0 0 100 100" width="22" height="22" className="claude-sparkle">
      <path fill="currentColor" d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  )
}

export function GroupPage({ onBack }: { onBack: (p: Page) => void }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roster, setRoster] = useState<RosterItem[]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [gate, setGate] = useState<'ok' | 'need' | 'loading'>('loading')
  const [cfg, setCfg] = useState<Config>({ maxAiTurns: 4, mentionFreeFollow: true, aiCrosstalk: true })
  const [barOpen, setBarOpen] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [newRoom, setNewRoom] = useState<{ name: string; members: string[]; memory: string } | null>(null)
  const [memberEdit, setMemberEdit] = useState<{ id: string; name: string; members: string[]; saving: boolean; error: string | null } | null>(null)
  const [editor, setEditor] = useState<{ who: string; label: string; draft: string; loading: boolean; save: 'ok' | 'fail' | null } | null>(null)
  const [nb, setNb] = useState<{ active: string[]; archived: string[] } | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [pendImgs, setPendImgs] = useState<string[]>([])
  const [pendFiles, setPendFiles] = useState<{ url: string; name?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [stickerTab, setStickerTab] = useState<'yaoyao' | 'xuxu'>('yaoyao')
  const [stickers, setStickers] = useState<Record<'yaoyao' | 'xuxu', Sticker[]>>({ yaoyao: [], xuxu: [] })
  const [stickerLoading, setStickerLoading] = useState(false)
  const [stickerError, setStickerError] = useState('')
  const [stickerUploading, setStickerUploading] = useState(false)
  const [stickerDescription, setStickerDescription] = useState('')
  const [stickerTags, setStickerTags] = useState('')
  const imgInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stickerInputRef = useRef<HTMLInputElement>(null)
  const [opts, setOpts] = useState<{ modelOpts: Record<string, string[]>; effortOpts: string[] }>({ modelOpts: {}, effortOpts: [] })
  const feedRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const histRef = useRef(false)

  const room = rooms.find(r => r.id === roomId) || null
  const feedItems = useMemo(() => groupFeed(msgs), [msgs])
  const selectRoom = useCallback((id: string | null) => {
    setRoomId(id)
    rememberRoom(id)
  }, [])
  const scroll = useCallback((force = false) => {
    const el = feedRef.current; if (!el) return
    if (force || stickRef.current) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [])
  const onScroll = () => { const el = feedRef.current; if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }

  // iOS 键盘弹出：贴底时跟着重新贴底
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let prevH = vv.height
    const onKb = () => {
      const shrank = vv.height < prevH - 60
      prevH = vv.height
      if (shrank && stickRef.current) scroll(true)
    }
    vv.addEventListener('resize', onKb)
    return () => vv.removeEventListener('resize', onKb)
  }, [scroll])

  // 进房/切房：历史一到，绘制前瞬间定位到底部（不闪顶部、无动画）
  useLayoutEffect(() => {
    if (!histRef.current) return
    histRef.current = false
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  // 挂载：登录 + 拉房间/成员池
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const pin = localStorage.getItem('sea-channel-pin') || ''
        await fetch(`${API}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }), credentials: 'same-origin' })
        const rr = await fetch(`${API}/rooms`, { credentials: 'same-origin' })
        if (rr.status === 401) { if (alive) setGate('need'); return }
        const rd = await rr.json()
        const ro = await (await fetch(`${API}/roster`, { credentials: 'same-origin' })).json()
        if (!alive) return
        const nextRooms: Room[] = rd.rooms || []
        const saved = readLastRoom()
        const nextId = (saved && nextRooms.some(r => r.id === saved)) ? saved : (nextRooms[0]?.id || null)
        setRooms(nextRooms); setRoster(ro.roster || [])
        selectRoom(nextId); setGate('ok')
      } catch { if (alive) setGate('need') }
    })()
    return () => { alive = false }
  }, [selectRoom])

  // 切房间：加载历史 + 接 SSE
  useEffect(() => {
    if (!roomId) return
    let es: EventSource | null = null; let alive = true
    ;(async () => {
      try {
        const data = await (await fetch(`${API}/history?room=${roomId}`, { credentials: 'same-origin' })).json()
        if (!alive) return
        histRef.current = true; setMsgs(data.msgs || []); setBusy(!!data.busy); if (data.config) setCfg(data.config); setUsage(data.usage || null); setStatus(null)
        stickRef.current = true; scroll(true)
        es = new EventSource(`${API}/events?room=${roomId}`)
        es.addEventListener('usage', e => setUsage(JSON.parse((e as MessageEvent).data)))
        es.addEventListener('msg', e => { setStatus(null); const m = JSON.parse((e as MessageEvent).data); setMsgs(p => [...p, m]); scroll() })
        es.addEventListener('status', e => setStatus(JSON.parse((e as MessageEvent).data).text))
        es.addEventListener('busy', e => { const b = JSON.parse((e as MessageEvent).data).busy; setBusy(b); if (!b) setStatus(null) })
        es.addEventListener('begin', e => { setStatus(null); const d = JSON.parse((e as MessageEvent).data); setMsgs(p => [...p, { id: d.id, role: d.role, text: '' }]); scroll() })
        es.addEventListener('token', e => { const d = JSON.parse((e as MessageEvent).data); setMsgs(p => p.map(m => m.id === d.id ? { ...m, text: m.text + d.text } : m)); scroll() })
        es.addEventListener('done', e => { const m = JSON.parse((e as MessageEvent).data); setMsgs(p => p.map(x => x.id === m.id ? m : x)); scroll() })
        es.addEventListener('cancel', e => { const d = JSON.parse((e as MessageEvent).data); setMsgs(p => p.filter(m => m.id !== d.id)) })
        es.addEventListener('room_meta', e => { const next = JSON.parse((e as MessageEvent).data); setRooms(p => p.map(r => r.id === next.id ? next : r)) })
      } catch {}
    })()
    return () => { alive = false; if (es) es.close() }
  }, [roomId, scroll])

  const send = async () => {
    const text = input.trim(); if ((!text && !pendImgs.length && !pendFiles.length) || !roomId) return
    const body: { text: string; images?: string[]; files?: { url: string; name?: string }[] } = { text }
    if (pendImgs.length) body.images = pendImgs
    if (pendFiles.length) body.files = pendFiles
    setInput(''); setPendImgs([]); setPendFiles([]); stickRef.current = true
    try { await fetch(`${API}/say?room=${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }) } catch {}
  }
  const decide = async (forId: number, choice: string, label: string, note: string) => {
    if (!roomId) return
    if (choice === 'explain') {
      try { await fetch(`${API}/say?room=${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '再讲白点——刚才那张卡我没太看懂，换个比喻讲讲' }), credentials: 'same-origin' }) } catch {}
      return
    }
    try { await fetch(`${API}/decide?room=${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forId, choice, label, note }), credentials: 'same-origin' }) } catch {}
  }
  const uploadOne = async (f: File): Promise<{ url: string; name: string } | null> => {
    const b64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(new Error('read')); r.readAsDataURL(f) })
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: b64, mime: f.type || 'application/octet-stream', name: f.name }), credentials: 'same-origin' })
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }
  const onPick = async (e: { target: HTMLInputElement }, kind: 'img' | 'file') => {
    const list = Array.from(e.target.files || []); e.target.value = ''
    if (!list.length) return
    setUploading(true)
    try {
      for (const f of list) {
        const r = await uploadOne(f)
        if (!r) continue
        if (kind === 'img') setPendImgs(p => [...p, r.url]); else setPendFiles(p => [...p, { url: r.url, name: r.name }])
      }
    } finally { setUploading(false) }
  }
  const loadStickerTab = async (owner: 'yaoyao' | 'xuxu') => {
    const res = await fetch(`${API}/stickers?owner=${owner}`, { credentials: 'same-origin' })
    const body = await res.json()
    if (!res.ok || !body.ok) throw new Error(body.error || '贴纸柜没打开')
    setStickers(prev => ({ ...prev, [owner]: body.stickers || [] }))
  }
  const openStickers = async () => {
    setStickerOpen(true); setPlusOpen(false); setStickerError(''); setStickerLoading(true)
    try { await Promise.all([loadStickerTab('yaoyao'), loadStickerTab('xuxu')]) }
    catch (e: any) { setStickerError(e?.message || '贴纸柜没打开') }
    finally { setStickerLoading(false) }
  }
  const uploadSticker = async (file: File) => {
    if (!file.type.startsWith('image/')) { setStickerError('这里只能收图片'); return }
    if (!stickerDescription.trim()) { setStickerError('先写一句这张图表达什么'); return }
    setStickerUploading(true); setStickerError('')
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
        reader.onerror = () => reject(new Error('图片没读出来'))
        reader.readAsDataURL(file)
      })
      const res = await fetch(`${API}/stickers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ data, mime: file.type, description: stickerDescription.trim(), tags: stickerTags }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error || '贴纸没存成')
      setStickers(prev => ({ ...prev, yaoyao: [body.sticker, ...prev.yaoyao.filter(row => row.id !== body.sticker.id)].slice(0, 12) }))
      setStickerDescription(''); setStickerTags(''); setStickerTab('yaoyao')
    } catch (e: any) { setStickerError(e?.message || '贴纸没存成') }
    finally { setStickerUploading(false) }
  }
  const onStickerPick = async (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (file) await uploadSticker(file)
  }
  const onStickerPaste = async (e: { clipboardData: DataTransfer; preventDefault: () => void }) => {
    const file = Array.from(e.clipboardData.items).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    if (!file) return
    e.preventDefault(); await uploadSticker(file)
  }
  const sendSticker = async (sticker: Sticker) => {
    if (!roomId) return
    setStickerOpen(false); stickRef.current = true
    try {
      await fetch(`${API}/say?room=${roomId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ text: '', images: [sticker.image_url] }),
      })
    } catch { setStickerError('贴纸没发出去') }
  }
  const removeSticker = async (sticker: Sticker) => {
    setStickerError('')
    try {
      const res = await fetch(`${API}/stickers?id=${encodeURIComponent(sticker.id)}`, { method: 'DELETE', credentials: 'same-origin' })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error || '贴纸没删成')
      setStickers(prev => ({ ...prev, yaoyao: prev.yaoyao.filter(row => row.id !== sticker.id) }))
    } catch (e: any) { setStickerError(e?.message || '贴纸没删成') }
  }
  const mention = (who: string) => setInput(v => (v.trim() ? v.trim() + ' ' : '') + '@' + who + ' ')
  const toggleInject = async () => {
    if (!room) return
    const next = room.inject === false
    setRooms(rs => rs.map(r => r.id === roomId ? { ...r, inject: next } : r))
    try { await fetch(`${API}/room-inject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: roomId, inject: next }), credentials: 'same-origin' }) } catch {}
  }
  const toggleKeepalive = async () => {
    if (!room) return
    const next = !(room.keepalive === true)
    setRooms(rs => rs.map(r => r.id === roomId ? { ...r, on: next } : r))
    try { await fetch(`${API}/room-keepalive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: roomId, on: next }), credentials: 'same-origin' }) } catch {}
  }

  const patchPerm = (msgId: number, path: string, patch: Partial<PermReq>) =>
    setMsgs(p => p.map(m => m.id !== msgId ? m : { ...m, perms: (m.perms || []).map(pm => pm.path === path ? { ...pm, ...patch } : pm) }))
  const grantPerm = async (msgId: number, path: string, minutes: number) => {
    if (!roomId) return
    try {
      const r = await fetch(`${API}/grant-codex?room=${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, minutes }), credentials: 'same-origin' })
      const j = await r.json()
      if (j.ok) patchPerm(msgId, path, { status: 'granted', minutes: j.minutes, expiry: j.expiry })
      else patchPerm(msgId, path, { status: 'failed', error: j.error || '未知' })
    } catch (e) { patchPerm(msgId, path, { status: 'failed', error: String(e) }) }
  }
  const revokePerm = async (msgId: number, path: string) => {
    if (!roomId) return
    try {
      await fetch(`${API}/revoke-codex?room=${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), credentials: 'same-origin' })
      patchPerm(msgId, path, { status: 'revoked' })
    } catch {}
  }

  const patchCfg = async (patch: Partial<Config>) => {
    setCfg({ ...cfg, ...patch })
    try { await fetch(`${API}/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch), credentials: 'same-origin' }) } catch {}
  }
  const createRoom = async () => {
    if (!newRoom || !newRoom.members.length) return
    try {
      const r = await (await fetch(`${API}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newRoom.name || '新房间', members: newRoom.members, memory: newRoom.memory }), credentials: 'same-origin' })).json()
      if (r.room) { setRooms(p => [...p, r.room]); selectRoom(r.room.id) }
    } catch {}
    setNewRoom(null); setBarOpen(false)
  }
  const saveRoomMembers = async () => {
    if (!memberEdit || !memberEdit.members.length) return
    setMemberEdit(e => e && { ...e, saving: true, error: null })
    try {
      const res = await fetch(`${API}/rooms`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: memberEdit.id, members: memberEdit.members }), credentials: 'same-origin' })
      const j = await res.json()
      if (!res.ok || !j.room) throw new Error(j.error || '保存失败')
      setRooms(p => p.map(r => r.id === j.room.id ? j.room : r))
      setMemberEdit(null)
    } catch (e: any) {
      setMemberEdit(cur => cur && { ...cur, saving: false, error: e?.message || '保存失败' })
    }
  }
  const delRoom = async (id: string) => {
    try { await fetch(`${API}/rooms?id=${id}`, { method: 'DELETE', credentials: 'same-origin' }) } catch {}
    const left = rooms.filter(r => r.id !== id); setRooms(left)
    const nextId = roomId === id ? (left[0]?.id || null) : roomId
    if (roomId === id || readLastRoom() === id) selectRoom(nextId)
  }
  const openEditor = async (who: string) => {
    setEditor({ who, label: '', draft: '', loading: true, save: null })
    try { const d = await (await fetch(`${API}/persona?who=${who}`, { credentials: 'same-origin' })).json(); setEditor({ who, label: d.label || '', draft: d.content || '', loading: false, save: null }) }
    catch { setEditor({ who, label: '读取失败', draft: '', loading: false, save: 'fail' }) }
  }
  const saveEditor = async () => {
    if (!editor) return
    try { const r = await fetch(`${API}/persona?who=${editor.who}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: editor.draft }), credentials: 'same-origin' }); setEditor(e => e && { ...e, save: r.ok ? 'ok' : 'fail' }) }
    catch { setEditor(e => e && { ...e, save: 'fail' }) }
  }
  const memberNames = (r: Room) => r.members.map(m => NAME[m] || m).filter((v, i, a) => a.indexOf(v) === i).join('、')
  const openSettings = async () => {
    setSetOpen(true)
    try {
      setNb(await (await fetch(`${API}/notebook`, { credentials: 'same-origin' })).json())
      const cj = await (await fetch(`${API}/config`, { credentials: 'same-origin' })).json()
      if (cj.config) setCfg(cj.config); setOpts({ modelOpts: cj.modelOpts || {}, effortOpts: cj.effortOpts || [] })
    } catch {}
  }
  const patchModelEffort = async (patch: { models?: Record<string, string>; effort?: Record<string, string> }) => {
    setCfg(c => ({ ...c, models: { ...c.models, ...patch.models }, effort: { ...c.effort, ...patch.effort } }))
    try { await fetch(`${API}/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch), credentials: 'same-origin' }) } catch {}
  }
  const setRoomMemory = async (memory: string) => {
    if (!roomId) return
    setRooms(rs => rs.map(r => r.id === roomId ? { ...r, memory } : r))
    try { await fetch(`${API}/room-memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: roomId, memory }), credentials: 'same-origin' }) } catch {}
  }

  return (
    <div className="gc-wrap">
      <style>{GC_CSS}</style>
      <header className="gc-top">
        <button className="gc-back" onClick={() => onBack('home')} aria-label="返回">‹</button>
        <button className="gc-roomname" onClick={() => setBarOpen(true)}>
          <span className="gc-title">{room?.name || '客 厅'}</span>
          <span className="gc-caret">▾</span>
        </button>
        <button className="gc-dots" onClick={openSettings} aria-label="设置"><span /><span /><span /></button>
      </header>

      {gate === 'need' && <div className="gc-need">先去苏煦那边登录一下就能进来了</div>}

      <div className="gc-feed" ref={feedRef} onScroll={onScroll}>
        {feedItems.map(item => {
          if (item.kind === 'tools') return <ToolRun key={`tools-${item.id}`} segmentId={item.id} items={item.items} />
          const m = item.msg
          return m.role === 'system'
            ? <div key={m.id} className="gc-sys">{m.text}</div>
            : (
            <div key={m.id} className={`cc-msg ${ROLE_CLASS[m.role]} gc-msg`}>
              <div className="cc-text-col">
                <div className="gc-who">{NAME[m.role]}</div>
                {(m.text || (!(m.images?.length || m.files?.length || m.keepsakes?.length) && !m.decision)) && (
                  <div className="cc-text">{m.text ? <Markdown text={m.text} keyBase={`m${m.id}`} /> : '…'}</div>
                )}
                {Array.isArray(m.images) && m.images.map(u => <img key={u} className="gc-img" src={u} loading="lazy" />)}
                {Array.isArray(m.files) && m.files.map(f => <a key={f.url} className="gc-file" href={f.url} download={f.name || true}>📎 {f.name || '文件'}</a>)}
                {Array.isArray(m.keepsakes) && m.keepsakes.map(card => <KeepsakeCard key={card.id} card={card} />)}
                {Array.isArray(m.perms) && m.perms.map(pm => (
                  <PermCard key={pm.path} perm={pm}
                    onGrant={mins => grantPerm(m.id, pm.path, mins)}
                    onRevoke={() => revokePerm(m.id, pm.path)} />
                ))}
                {m.decision && <DecisionCard m={m} answeredChoice={msgs.find(x => x.decideFor === m.id)?.choice} onDecide={(c, l, n) => decide(m.id, c, l, n)} />}
              </div>
            </div>
          )
        })}
        {status && <div className="gc-sys">{status}<span className="gc-dots-anim"><i /><i /><i /></span></div>}
      </div>

      <div className="gc-bar">
        {usage && <div className="gc-ctxline">上下文 {kFmt(usage.ctx)} · 缓存命中 {hitPct(usage)}%</div>}
        {busy && <div className="gc-hint-row">他们在说…可随时插话</div>}
        <input ref={imgInputRef} type="file" accept="image/*" multiple hidden onChange={e => onPick(e, 'img')} />
        <input ref={fileInputRef} type="file" multiple hidden onChange={e => onPick(e, 'file')} />
        {(pendImgs.length > 0 || pendFiles.length > 0 || uploading) && (
          <div className="gc-pend">
            {pendImgs.map(u => <span key={u} className="gc-pend-img"><img src={u} /><i onClick={() => setPendImgs(p => p.filter(x => x !== u))}>×</i></span>)}
            {pendFiles.map(f => <span key={f.url} className="gc-pend-file">📎{f.name || '文件'}<i onClick={() => setPendFiles(p => p.filter(x => x.url !== f.url))}>×</i></span>)}
            {uploading && <span className="gc-pend-file">上传中…</span>}
          </div>
        )}
        <div className="cc-input-pill gc-ccpill">
          <div className="cc-plus-wrap">
            {plusOpen && (
              <div className="cc-plus-menu">
                <button className={`cc-plus-item hints${room?.inject !== false ? ' on' : ' off'}`} onClick={toggleInject} aria-label="记忆注入" title={`记忆注入：${room?.inject !== false ? '开' : '关'}`}><HintsSvg /></button>
                <button className="cc-plus-item gc-at" onClick={toggleKeepalive} aria-label="缓存保活" title="每约50分钟静默续一次苏煦的缓存">{`保活${room?.keepalive ? '·开' : '·关'}`}</button>
                <button className="cc-plus-item gc-at" onClick={() => { imgInputRef.current?.click(); setPlusOpen(false) }}>发照片</button>
                <button className="cc-plus-item gc-at" onClick={() => { fileInputRef.current?.click(); setPlusOpen(false) }}>发文件</button>
                <button className="cc-plus-item gc-at" onClick={openStickers}>贴纸</button>
                {(room?.members || []).includes('suxu') && <button className="cc-plus-item gc-at" onClick={() => { mention('苏煦'); setPlusOpen(false) }}>@苏煦</button>}
                {(room?.members || []).includes('suxu-api') && <button className="cc-plus-item gc-at" onClick={() => { mention('苏煦API'); setPlusOpen(false) }}>@API</button>}
                {(room?.members || []).includes('codex') && <button className="cc-plus-item gc-at" onClick={() => { mention('codex'); setPlusOpen(false) }}>@codex</button>}
              </div>
            )}
            <button className={`cc-plus${plusOpen ? ' open' : ''}`} onClick={() => setPlusOpen(o => !o)} aria-label="附件"><PlusSvg /></button>
          </div>
          <textarea value={input} placeholder="说点什么…" rows={1}
            onChange={e => { setInput(e.target.value); const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px' }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="cc-send" onClick={send} disabled={!input.trim() && !pendImgs.length && !pendFiles.length} aria-label="发送"><ClaudeSparkle /></button>
        </div>
      </div>

      {stickerOpen && (
        <div className="gc-sticker-mask" onClick={() => setStickerOpen(false)}>
          <section className="gc-sticker-sheet" onClick={e => e.stopPropagation()} onPaste={onStickerPaste}>
            <div className="gc-sticker-head">
              <div><div className="gc-sticker-title">贴纸柜</div><div className="gc-sticker-sub">点一下就发出去</div></div>
              <button className="gc-sticker-close" onClick={() => setStickerOpen(false)} aria-label="关闭">×</button>
            </div>
            <div className="gc-sticker-tabs">
              <button className={stickerTab === 'yaoyao' ? 'on' : ''} onClick={() => setStickerTab('yaoyao')}>我的</button>
              <button className={stickerTab === 'xuxu' ? 'on' : ''} onClick={() => setStickerTab('xuxu')}>苏煦的</button>
            </div>
            {stickerTab === 'yaoyao' && (
              <div className="gc-sticker-add">
                <input value={stickerDescription} maxLength={240} placeholder="这张图表达什么（必填）" onChange={e => setStickerDescription(e.target.value)} />
                <input value={stickerTags} maxLength={240} placeholder="标签，用空格隔开" onChange={e => setStickerTags(e.target.value)} />
                <input ref={stickerInputRef} type="file" accept="image/*" hidden onChange={onStickerPick} />
                <button disabled={stickerUploading} onClick={() => stickerInputRef.current?.click()}>{stickerUploading ? '正在收好…' : '选图收藏'}</button>
                <span>也可以直接在这里粘贴图片</span>
              </div>
            )}
            {stickerError && <div className="gc-sticker-error">{stickerError}</div>}
            {stickerLoading ? <div className="gc-sticker-empty">正在翻柜子…</div> : (
              <div className="gc-sticker-grid">
                {stickers[stickerTab].map(sticker => (
                  <div key={sticker.id} className="gc-sticker-item">
                    <button className="gc-sticker-image" onClick={() => sendSticker(sticker)} title={sticker.description}>
                      <img src={sticker.image_url} alt={sticker.description} loading="lazy" />
                    </button>
                    <div className="gc-sticker-desc">{sticker.description}</div>
                    {stickerTab === 'yaoyao' && <button className="gc-sticker-remove" onClick={() => removeSticker(sticker)} aria-label={`删除${sticker.description}`}>删除</button>}
                  </div>
                ))}
                {!stickers[stickerTab].length && <div className="gc-sticker-empty">{stickerTab === 'yaoyao' ? '你的柜子还是空的，先收第一张吧' : '苏煦还没往这里攒图'}</div>}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 侧边栏：房间列表 */}
      {barOpen && (
        <div className="gc-drawer-mask" onClick={() => setBarOpen(false)}>
          <div className="gc-drawer" onClick={e => e.stopPropagation()}>
            <div className="gc-drawer-title">房间</div>
            <div className="gc-room-list">
              {rooms.map(r => (
                <div key={r.id} className={`gc-room${r.id === roomId ? ' on' : ''}`} onClick={() => { selectRoom(r.id); setBarOpen(false) }}>
                  <div className="gc-room-txt"><div className="gc-room-name">{r.name}</div><div className="gc-room-mem">{memberNames(r)} · {MEM_LABEL[r.memory || 'work']}</div></div>
                  <div className="gc-room-actions">
                    <button className="gc-room-members" onClick={e => { e.stopPropagation(); setMemberEdit({ id: r.id, name: r.name, members: [...r.members], saving: false, error: null }) }}>成员</button>
                    {rooms.length > 1 && <button className="gc-room-del" onClick={e => { e.stopPropagation(); delRoom(r.id) }} aria-label="删除">×</button>}
                  </div>
                </div>
              ))}
            </div>
            <button className="gc-newroom" onClick={() => setNewRoom({ name: '', members: ['suxu'], memory: 'work' })}>＋ 新房间</button>
          </div>
        </div>
      )}

      {/* 新建房间：选成员 */}
      {newRoom && (
        <div className="cc-modal-backdrop" onClick={() => setNewRoom(null)}>
          <div className="cc-modal glass gc-newmodal" onClick={e => e.stopPropagation()}>
            <div className="cc-modal-title">新房间</div>
            <input className="gc-name-input" placeholder="房间名字" value={newRoom.name} maxLength={24}
              onChange={e => setNewRoom({ ...newRoom, name: e.target.value })} />
            <div className="gc-pick-label">拉谁进来</div>
            <div className="gc-pick-list">
              {roster.map(m => {
                const on = newRoom.members.includes(m.id)
                return (
                  <button key={m.id} className={`gc-pick${on ? ' on' : ''}`}
                    onClick={() => setNewRoom({ ...newRoom, members: on ? newRoom.members.filter(x => x !== m.id) : [...newRoom.members, m.id] })}>
                    <span className="gc-pick-check">{on ? '✓' : ''}</span>
                    <span className="gc-pick-txt"><span className="gc-pick-name">{m.label}</span><span className="gc-pick-desc">{m.desc}</span></span>
                  </button>
                )
              })}
            </div>
            <div className="gc-pick-label">这个房间的记忆走哪</div>
            <div className="gc-pick-list">
              {MEM_MODES.map(m => (
                <button key={m.id} className={`gc-pick${newRoom.memory === m.id ? ' on' : ''}`} onClick={() => setNewRoom({ ...newRoom, memory: m.id })}>
                  <span className="gc-pick-check">{newRoom.memory === m.id ? '✓' : ''}</span>
                  <span className="gc-pick-txt"><span className="gc-pick-name">{m.label}</span><span className="gc-pick-desc">{m.desc}</span></span>
                </button>
              ))}
            </div>
            <div className="cc-modal-actions">
              <button className="cc-panel-action" onClick={createRoom} disabled={!newRoom.members.length}>创建</button>
              <button onClick={() => setNewRoom(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 房间成员：随时增减，下条消息起按新名单轮转 */}
      {memberEdit && (
        <div className="cc-modal-backdrop" onClick={() => !memberEdit.saving && setMemberEdit(null)}>
          <div className="cc-modal glass gc-newmodal" onClick={e => e.stopPropagation()}>
            <div className="cc-modal-title">「{memberEdit.name}」里有谁</div>
            <div className="gc-pick-label">勾选要留在房间里的人</div>
            <div className="gc-pick-list">
              {roster.map(m => {
                const on = memberEdit.members.includes(m.id)
                return (
                  <button key={m.id} className={`gc-pick${on ? ' on' : ''}`} disabled={memberEdit.saving}
                    onClick={() => setMemberEdit(cur => cur && { ...cur, members: on ? cur.members.filter(x => x !== m.id) : [...cur.members, m.id], error: null })}>
                    <span className="gc-pick-check">{on ? '✓' : ''}</span>
                    <span className="gc-pick-txt"><span className="gc-pick-name">{m.label}</span><span className="gc-pick-desc">{m.desc}</span></span>
                  </button>
                )
              })}
            </div>
            {!memberEdit.members.length && <div className="gc-save fail">房间里至少留一个人</div>}
            {memberEdit.error && <div className="gc-save fail">{memberEdit.error}</div>}
            <div className="cc-modal-actions">
              <button className="cc-panel-action" onClick={saveRoomMembers} disabled={memberEdit.saving || !memberEdit.members.length}>{memberEdit.saving ? '保存中…' : '保存成员'}</button>
              <button onClick={() => setMemberEdit(null)} disabled={memberEdit.saving}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 设置 */}
      {setOpen && (
        <div className="cc-modal-backdrop" onClick={() => setSetOpen(false)}>
          <div className="cc-modal glass gc-settings" onClick={e => e.stopPropagation()}>
            <div className="cc-modal-title">客厅设置</div>
            <div className="gc-set-row">
              <div className="gc-set-label">他们最多接几轮<span className="gc-set-sub">一次讨论里 AI 发言的上限</span></div>
              <div className="gc-stepper">
                <button onClick={() => patchCfg({ maxAiTurns: Math.max(1, cfg.maxAiTurns - 1) })}>−</button>
                <span>{cfg.maxAiTurns}</span>
                <button onClick={() => patchCfg({ maxAiTurns: Math.min(12, cfg.maxAiTurns + 1) })}>＋</button>
              </div>
            </div>
            <div className="gc-set-row">
              <div className="gc-set-label">@之后另一个也能接话<span className="gc-set-sub">关掉=@谁只答一次</span></div>
              <button className={`gc-toggle${cfg.mentionFreeFollow ? ' on' : ''}`} onClick={() => patchCfg({ mentionFreeFollow: !cfg.mentionFreeFollow })}><span /></button>
            </div>
            <div className="gc-set-row">
              <div className="gc-set-label">不@时两人能互相搭话<span className="gc-set-sub">关掉=各说一次就停</span></div>
              <button className={`gc-toggle${cfg.aiCrosstalk ? ' on' : ''}`} onClick={() => patchCfg({ aiCrosstalk: !cfg.aiCrosstalk })}><span /></button>
            </div>
            <div className="gc-memsec">
              <div className="gc-memsec-title">「{room?.name}」的记忆走哪</div>
              <div className="gc-mem-modes">
                {MEM_MODES.map(m => (
                  <button key={m.id} className={`gc-mem-mode${room?.memory === m.id ? ' on' : ''}`} onClick={() => setRoomMemory(m.id)}>
                    <div className="gc-mem-name">{m.label}</div><div className="gc-mem-desc">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {usage && (
              <div className="gc-usage">
                <div className="gc-usage-title">当前对话</div>
                <div className="gc-usage-line"><span>上下文</span><b>{kFmt(usage.ctx)}</b><span className="gc-usage-sep">·</span><span>缓存命中</span><b>{usage.ctx ? Math.round(usage.cacheRead / usage.ctx * 100) : 0}%</b></div>
                <div className="gc-usage-track"><div className="gc-usage-fill" style={{ width: (usage.ctx ? Math.round(usage.cacheRead / usage.ctx * 100) : 0) + '%' }} /></div>
                <div className="gc-usage-meta">本轮 你 {kFmt(usage.input)} · {usage.who === 'codex' ? '皮卡晏' : '苏煦'} {kFmt(usage.output)} · {usage.model}</div>
              </div>
            )}
            <div className="gc-aiconf">
              <div className="gc-memsec-title">模型 · 思考强度（下条生效）</div>
              {ROLE_CONF.map(rc => (
                <div key={rc.who} className="gc-aiconf-row">
                  <span className="gc-aiconf-name">{rc.label}</span>
                  {opts.modelOpts[rc.who]
                    ? <select className="gc-select" value={cfg.models?.[rc.who] || ''} onChange={e => patchModelEffort({ models: { [rc.who]: e.target.value } })}>
                      {opts.modelOpts[rc.who].map(m => <option key={m} value={m}>{shortModelName(m)}</option>)}
                    </select>
                    : <span className="gc-aiconf-fixed">{shortModelName(cfg.models?.[rc.who] || '')}</span>}
                  <select className="gc-select gc-select-eff" value={cfg.effort?.[rc.who] || 'default'} onChange={e => patchModelEffort({ effort: { [rc.who]: e.target.value } })}>
                    {opts.effortOpts.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="gc-set-edits">
              <button className="cc-panel-action" onClick={() => openEditor('suxu')}>编辑 苏煦 · CLAUDE.md（订阅+API 共用）</button>
              <button className="cc-panel-action" onClick={() => openEditor('codex')}>编辑皮卡晏 · AGENTS.md</button>
            </div>
            {nb && nb.active.length > 0 && (
              <div className="gc-nb">
                <div className="gc-nb-title">皮卡晏小本子 · 在办</div>
                {nb.active.map((t, i) => <div key={i} className="gc-nb-item">· {t}</div>)}
              </div>
            )}
            <div className="cc-modal-actions"><button onClick={() => setSetOpen(false)}>关闭</button></div>
          </div>
        </div>
      )}

      {/* 人设编辑 */}
      {editor && (
        <div className="cc-modal-backdrop" onClick={() => setEditor(null)}>
          <div className="cc-modal glass gc-editor" onClick={e => e.stopPropagation()}>
            <div className="cc-modal-title">{editor.label || '加载中'}</div>
            {editor.loading ? <div className="cc-panel-loading">加载中…</div> : (
              <textarea className="cc-modal-input gc-editor-input" value={editor.draft} spellCheck={false}
                onChange={e => setEditor(ed => ed && { ...ed, draft: e.target.value, save: null })} />
            )}
            {editor.save === 'ok' && <div className="gc-save ok">已保存，下次他开口生效</div>}
            {editor.save === 'fail' && <div className="gc-save fail">保存失败</div>}
            <div className="cc-modal-actions">
              <button className="cc-panel-action" onClick={saveEditor} disabled={editor.loading}>保存</button>
              <button onClick={() => setEditor(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const GC_CSS = `
.gc-wrap{position:absolute;inset:0;bottom:var(--kb, 0px);display:flex;flex-direction:column;z-index:2}
.gc-top{display:flex;align-items:center;padding:calc(env(safe-area-inset-top) + 8px) 10px 6px;flex:0 0 auto}
.gc-back{border:none;background:transparent;font-size:26px;line-height:1;color:var(--ink-soft,#8a8478);width:40px;height:40px;border-radius:12px}
.gc-back:active{background:rgba(0,0,0,.05)}
.gc-roomname{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;border:none;background:transparent}
.gc-title{font-family:var(--font-display,serif);font-size:17px;letter-spacing:.2em;color:var(--ink,#7d7566)}
.gc-caret{font-size:10px;color:var(--ink-faint,#a8a294)}
.gc-dots{border:none;background:transparent;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:3px}
.gc-dots span{width:4px;height:4px;border-radius:50%;background:var(--ink-soft,#9a948a)}
.gc-dots:active{background:rgba(0,0,0,.05)}
.gc-need{margin:8px 16px;text-align:center;font-size:13px;color:#b58a8a;background:rgba(255,255,255,.4);border-radius:12px;padding:10px}
.gc-feed{flex:1 1 auto;overflow-y:auto;padding:8px 16px 10px;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:18px}
.gc-msg{margin:0;animation:gc-rise .3s ease}
@keyframes gc-rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.gc-who{font-size:11px;color:var(--ink-faint,#a8a294);letter-spacing:.06em;margin-bottom:3px}
.cc-msg.user .gc-who{color:#b79a63}.cc-msg.assistant .gc-who{color:#6f97b4}
.gc-msg.codex .cc-text{color:oklch(0.48 0.06 150)}.gc-msg.codex .gc-who{color:#8a9683}
.gc-sys{align-self:center;text-align:center;font-size:12px;color:var(--ink-faint,#aca596);margin:2px auto;letter-spacing:.05em}
.gc-dots-anim{display:inline-flex;margin-left:5px;vertical-align:middle}
.gc-dots-anim i{width:4px;height:4px;margin:0 1px;border-radius:50%;background:currentColor;opacity:.4;animation:gc-blink 1.2s infinite}
.gc-dots-anim i:nth-child(2){animation-delay:.2s}.gc-dots-anim i:nth-child(3){animation-delay:.4s}
@keyframes gc-blink{0%,60%,100%{opacity:.25}30%{opacity:.85}}
/* 跟主页导航栏 dock 同尺寸：480 居中·28px padding·透明浮层 */
.gc-bar{flex:0 0 auto;width:100%;max-width:480px;margin:0 auto;padding:14px 28px;padding-bottom:calc(20px + env(safe-area-inset-bottom, 0px))}
.gc-hint-row{font-size:11.5px;color:var(--ink-faint,#b0a999);letter-spacing:.04em;text-align:center;margin-bottom:6px}
.gc-ctxline{font-size:11px;color:var(--ink-faint,#b0a999);letter-spacing:.04em;text-align:center;margin-bottom:5px;opacity:.85}
/* 复用主聊天输入胶囊(cc-input-pill 主题自适应)，强制横排 */
/* 跟主聊天手机端输入胶囊完全同值(统一高度) */
.gc-ccpill{display:flex !important;flex-direction:row !important;align-items:flex-end !important;gap:6px !important;min-height:52px !important;max-height:50vh !important;padding:4px 6px !important;border-radius:26px !important}
.gc-ccpill textarea{flex:1 1 auto;min-width:0}
/* @ 项在圆形菜单里做成文字小胶囊 */
.gc-at{width:auto !important;min-width:auto !important;height:auto !important;padding:7px 12px !important;border-radius:16px !important;font-size:13px;font-family:var(--font-body,inherit)}
.gc-pill{display:flex;align-items:flex-end;gap:8px;padding:8px 12px;border-radius:22px;
  background:linear-gradient(180deg,rgba(0,0,0,0.02) 0%,rgba(255,255,255,0.06) 100%),rgba(150,180,220,0.05);
  -webkit-backdrop-filter:blur(6px) saturate(120%);backdrop-filter:blur(6px) saturate(120%);
  box-shadow:0 1px 0 rgba(255,255,255,0.3),0 16px 40px rgba(0,0,0,0.07),inset 0 0 20px rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.4)}
.gc-plus-wrap{position:relative;flex:0 0 auto}
.gc-plus{width:34px;height:34px;border-radius:50%;border:0.5px solid rgba(255,255,255,0.65);
  background:linear-gradient(180deg,rgba(255,255,255,0.2) 0%,rgba(0,0,0,0.02) 100%),rgba(150,180,220,0.06);
  color:var(--ink-soft,#8a8478);font-family:var(--font-display,serif);font-style:italic;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;transition:transform .25s}
.gc-plus.open{transform:rotate(45deg)}
.gc-plus-menu{position:absolute;bottom:44px;left:0;display:flex;flex-direction:column;gap:2px;padding:5px;border-radius:14px;background:rgba(255,255,255,.92);box-shadow:0 6px 24px rgba(80,70,50,.16);min-width:96px}
.gc-plus-menu button{border:none;background:transparent;padding:9px 12px;font-size:14px;font-family:inherit;text-align:left;border-radius:9px;color:var(--ink,#4a463e)}
.gc-plus-menu button:active{background:rgba(120,110,90,.08)}
.gc-ta{flex:1;border:none;background:transparent;padding:9px 2px;font-size:15px;line-height:1.5;resize:none;font-family:var(--font-body,inherit);color:var(--ink,#3a3a3c);min-height:22px;max-height:200px;outline:none}
.gc-plus svg{display:block}
.gc-ta::placeholder{color:var(--ink-faint,#a8a294);opacity:.6}
.gc-send{flex:0 0 auto;width:40px;height:40px;border:none;background:transparent;color:oklch(0.52 0.08 256);display:flex;align-items:center;justify-content:center;transition:transform .15s}
.gc-send:active{transform:scale(1.12)}.claude-sparkle{display:block}
/* 贴纸柜 */
.gc-sticker-mask{position:fixed;inset:0;z-index:75;display:flex;align-items:flex-end;justify-content:center;background:rgba(25,28,34,.18);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.gc-sticker-sheet{width:min(100%,520px);max-height:min(76dvh,680px);display:flex;flex-direction:column;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));border-radius:24px 24px 0 0;background:rgba(252,250,246,.98);box-shadow:0 -16px 48px rgba(58,52,42,.16)}
.gc-sticker-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.gc-sticker-title{font-family:var(--font-display,serif);font-size:18px;letter-spacing:.16em;color:var(--ink,#5f584d)}
.gc-sticker-sub{font-size:11.5px;color:var(--ink-faint,#a8a294);margin-top:2px}
.gc-sticker-close{width:34px;height:34px;border:none;border-radius:50%;background:rgba(120,110,90,.08);color:var(--ink-soft,#8a8478);font-size:22px}
.gc-sticker-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:14px 0 10px;padding:4px;border-radius:14px;background:rgba(120,110,90,.07)}
.gc-sticker-tabs button{border:none;border-radius:10px;padding:8px;background:transparent;color:var(--ink-soft,#8a8478);font-family:inherit;font-size:13px}
.gc-sticker-tabs button.on{background:rgba(255,255,255,.82);color:var(--ink,#4a463e);box-shadow:0 2px 8px rgba(80,70,50,.08)}
.gc-sticker-add{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:center;margin-bottom:10px}
.gc-sticker-add input{min-width:0;border:1px solid rgba(120,110,90,.16);border-radius:10px;padding:8px 10px;background:rgba(255,255,255,.65);font:inherit;font-size:12px;color:var(--ink,#4a463e);outline:none}
.gc-sticker-add button{border:none;border-radius:10px;padding:9px 11px;background:linear-gradient(135deg,#c7ad84,#b2925f);color:#fff;font:inherit;font-size:12px;white-space:nowrap}
.gc-sticker-add button:disabled{opacity:.55}.gc-sticker-add span{grid-column:1/-1;font-size:10.5px;color:var(--ink-faint,#a8a294);text-align:right}
.gc-sticker-error{padding:8px 10px;margin-bottom:8px;border-radius:10px;background:rgba(194,110,110,.09);color:#a56767;font-size:12px}
.gc-sticker-grid{overflow-y:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:2px;overscroll-behavior:contain}
.gc-sticker-item{position:relative;min-width:0;padding:7px;border-radius:14px;background:rgba(255,255,255,.55);border:1px solid rgba(120,110,90,.09)}
.gc-sticker-image{display:block;width:100%;aspect-ratio:1;border:none;border-radius:10px;overflow:hidden;padding:0;background:rgba(120,110,90,.05)}
.gc-sticker-image img{display:block;width:100%;height:100%;object-fit:contain}
.gc-sticker-desc{font-size:10.5px;color:var(--ink-soft,#817a70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:5px 1px 0}
.gc-sticker-remove{display:block;margin:4px 0 0 auto;border:none;background:transparent;color:#b48585;font:inherit;font-size:10.5px;padding:2px}
.gc-sticker-empty{grid-column:1/-1;padding:36px 12px;text-align:center;color:var(--ink-faint,#aaa294);font-size:13px}
@media(max-width:390px){.gc-sticker-add{grid-template-columns:1fr auto}.gc-sticker-add input:first-child{grid-column:1/-1}.gc-sticker-grid{gap:7px}.gc-sticker-sheet{padding-left:13px;padding-right:13px}}
/* 侧边栏 */
.gc-drawer-mask{position:fixed;inset:0;z-index:60;background:rgba(20,30,60,.14);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);animation:gc-fade .18s ease}
@keyframes gc-fade{from{opacity:0}to{opacity:1}}
.gc-drawer{position:absolute;top:0;left:0;bottom:0;width:min(76vw,300px);display:flex;flex-direction:column;
  padding:calc(env(safe-area-inset-top) + 18px) 14px calc(env(safe-area-inset-bottom) + 14px);
  background:rgba(252,250,245,.96);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:8px 0 32px rgba(80,70,50,.14);animation:gc-slide .22s ease}
@keyframes gc-slide{from{transform:translateX(-100%)}to{transform:none}}
.gc-drawer-title{font-family:var(--font-display,serif);font-size:16px;letter-spacing:.28em;color:var(--ink,#7d7566);margin:0 4px 14px}
.gc-room-list{flex:1 1 auto;overflow-y:auto;display:flex;flex-direction:column;gap:4px}
.gc-room{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:14px;transition:background .15s}
.gc-room.on{background:rgba(199,173,132,.16)}
.gc-room:active{background:rgba(120,110,90,.08)}
.gc-room-txt{flex:1;min-width:0}
.gc-room-name{font-size:15px;color:var(--ink,#4a463e)}
.gc-room-mem{font-size:11.5px;color:var(--ink-faint,#a8a294);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-room-actions{display:flex;align-items:center;gap:2px}
.gc-room-members{flex:0 0 auto;border:none;background:rgba(255,255,255,.45);font-size:11.5px;color:var(--ink-soft,#8a8478);padding:5px 8px;border-radius:9px;font-family:inherit}
.gc-room-members:active{background:rgba(199,173,132,.2)}
.gc-room-del{flex:0 0 auto;border:none;background:transparent;font-size:18px;color:var(--ink-faint,#b8b2a6);width:26px;height:26px;border-radius:50%}
.gc-room-del:active{background:rgba(180,120,120,.14);color:#b06a6a}
.gc-newroom{margin-top:10px;border:1px dashed rgba(120,110,90,.3);background:transparent;border-radius:14px;padding:12px;font-size:14px;font-family:inherit;color:var(--ink-soft,#8a8478)}
.gc-newroom:active{background:rgba(120,110,90,.06)}
/* 新建房间选成员 */
.gc-name-input{width:100%;border:1px solid rgba(120,110,90,.2);border-radius:12px;padding:10px 12px;font-size:15px;font-family:inherit;background:rgba(255,253,249,.9);color:var(--ink,#3a3a3c);outline:none}
.gc-name-input:focus{border-color:#d9cdb4}
.gc-pick-label{font-size:12.5px;color:var(--ink-faint,#a8a294);margin:14px 2px 6px;letter-spacing:.05em}
.gc-pick-list{display:flex;flex-direction:column;gap:6px}
.gc-pick{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(120,110,90,.16);border-radius:12px;background:rgba(255,255,255,.4);text-align:left}
.gc-pick.on{border-color:#c7ad84;background:rgba(199,173,132,.12)}
.gc-pick-check{flex:0 0 auto;width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(120,110,90,.3);display:flex;align-items:center;justify-content:center;font-size:12px;color:#b2925f}
.gc-pick.on .gc-pick-check{border-color:#c7ad84;background:rgba(199,173,132,.2)}
.gc-pick-txt{display:flex;flex-direction:column;gap:2px}
.gc-pick-name{font-size:14px;color:var(--ink,#4a463e)}
.gc-pick-desc{font-size:11px;color:var(--ink-faint,#a8a294)}
/* 设置面板 */
.gc-settings{max-height:calc(80dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.gc-set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 2px;border-bottom:1px solid rgba(120,110,90,.1)}
.gc-set-label{font-size:14px;color:var(--ink,#4a463e);display:flex;flex-direction:column;gap:2px}
.gc-set-sub{font-size:11px;color:var(--ink-faint,#a8a294)}
.gc-stepper{display:flex;align-items:center;gap:10px}
.gc-stepper button{width:28px;height:28px;border-radius:50%;border:1px solid rgba(120,110,90,.25);background:rgba(255,255,255,.5);font-size:16px;line-height:1;color:var(--ink,#6a6255)}
.gc-stepper span{min-width:18px;text-align:center;font-size:15px;color:var(--ink,#4a463e)}
.gc-toggle{width:44px;height:26px;border-radius:14px;border:none;background:rgba(120,110,90,.25);position:relative;transition:background .2s}
.gc-toggle.on{background:linear-gradient(135deg,#c7ad84,#b2925f)}
.gc-toggle span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.15)}
.gc-toggle.on span{transform:translateX(18px)}
.gc-usage{margin-top:14px;padding:12px;border-radius:12px;background:rgba(120,110,90,.05)}
.gc-usage-title{font-size:12px;color:var(--ink-faint,#a8a294);letter-spacing:.05em;margin-bottom:7px}
.gc-usage-line{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink,#4a463e)}
.gc-usage-line b{color:#8a6f45}
.gc-usage-sep{color:var(--ink-faint,#c0bab0)}
.gc-usage-track{height:5px;border-radius:3px;background:rgba(120,110,90,.14);margin:7px 0 6px;overflow:hidden}
.gc-usage-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#c7ad84,#b2925f)}
.gc-usage-meta{font-size:11px;color:var(--ink-faint,#a8a294)}
.gc-img{display:block;max-width:min(78%,340px);border-radius:14px;margin-top:6px}
.gc-keepsake{display:block;width:min(88vw,360px);margin-top:8px;border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;background:rgba(255,253,248,.76);border:1px solid rgba(174,151,112,.2);box-shadow:0 10px 30px rgba(82,68,45,.08)}
.gc-keepsake img{display:block;width:100%;max-height:320px;aspect-ratio:4/3;object-fit:cover;background:rgba(160,145,120,.08)}
.gc-keepsake-body{padding:12px 14px 14px}
.gc-keepsake-cap{display:flex;justify-content:space-between;gap:12px;font-size:10.5px;letter-spacing:.12em;color:#a68b62}
.gc-keepsake-cap time{letter-spacing:.04em;color:var(--ink-faint,#aaa294)}
.gc-keepsake-title{margin-top:7px;font-size:14px;color:var(--ink,#4a463e);font-weight:600}
.gc-keepsake-words{margin-top:7px;font-size:14px;line-height:1.65;color:var(--ink,#4a463e);white-space:pre-wrap}
.gc-keepsake-price{margin-top:8px;font-size:11px;color:var(--ink-faint,#9d968b)}
.gc-file{display:inline-block;margin-top:6px;font-size:13px;color:#8a6f45;text-decoration:none;padding:6px 10px;border-radius:10px;background:rgba(120,110,90,.07)}
.gc-pend{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;padding:0 4px}
.gc-pend-img{position:relative;display:inline-block}
.gc-pend-img img{width:52px;height:52px;object-fit:cover;border-radius:10px}
.gc-pend-img i{cursor:pointer;font-style:normal;position:absolute;top:-6px;right:-6px;background:rgba(0,0,0,.45);color:#fff;border-radius:50%;width:16px;height:16px;line-height:15px;text-align:center;font-size:11px}
.gc-pend-file{font-size:12px;color:var(--ink,#4a463e);background:rgba(120,110,90,.07);border-radius:10px;padding:5px 9px}
.gc-pend-file i{cursor:pointer;font-style:normal;margin-left:6px;color:#a8a294}
.gc-aiconf{margin-top:14px}
.gc-aiconf-row{display:flex;align-items:center;gap:7px;margin-top:8px}
.gc-aiconf-name{flex:0 0 62px;font-size:12.5px;color:var(--ink,#4a463e)}
.gc-aiconf-fixed{flex:1;font-size:12px;color:var(--ink-faint,#a8a294);padding:6px 2px}
.gc-select{flex:1;min-width:0;padding:6px 8px;border-radius:8px;border:1px solid rgba(120,110,90,.2);background:rgba(255,255,255,.6);color:var(--ink,#4a463e);font-family:inherit;font-size:12.5px}
.gc-select-eff{flex:0 0 84px}
.gc-memsec{margin-top:14px}
.gc-memsec-title{font-size:13px;color:var(--ink,#4a463e);margin:0 2px 8px;letter-spacing:.03em}
.gc-mem-modes{display:flex;flex-direction:column;gap:6px}
.gc-mem-mode{text-align:left;padding:9px 12px;border:1px solid rgba(120,110,90,.16);border-radius:12px;background:rgba(255,255,255,.4)}
.gc-mem-mode.on{border-color:#c7ad84;background:rgba(199,173,132,.12)}
.gc-mem-name{font-size:14px;color:var(--ink,#4a463e)}
.gc-mem-desc{font-size:11px;color:var(--ink-faint,#a8a294);margin-top:2px}
.gc-set-edits{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.gc-nb{margin-top:14px;padding:12px;border-radius:12px;background:rgba(120,110,90,.05)}
.gc-nb-title{font-size:12px;color:var(--ink-faint,#a8a294);letter-spacing:.05em;margin-bottom:6px}
.gc-nb-item{font-size:13px;color:var(--ink,#4a463e);line-height:1.7}
.gc-editor-input{width:100%;min-height:46vh;max-height:60vh;font-size:13px;line-height:1.6;font-family:var(--font-body,system-ui)}
.gc-save{font-size:12px;margin-top:8px;text-align:center}.gc-save.ok{color:#6f9a6f}.gc-save.fail{color:#c58b8b}
/* codex 临时写权卡片（2026-07-23） */
.gc-perm{margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(179,153,110,.08);border:1px solid rgba(179,153,110,.22);font-size:12.5px;color:var(--ink,#4a463e);max-width:min(90%,420px)}
.gc-perm-granted{border-color:rgba(120,180,120,.35);background:rgba(120,180,120,.06)}
.gc-perm-revoked,.gc-perm-failed{opacity:.75}
.gc-perm-head{display:flex;align-items:center;gap:6px}
.gc-perm-ico{font-size:14px}
.gc-perm-path{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:var(--ink-soft,#7a746a);word-break:break-all;background:transparent;padding:0}
.gc-perm-reason{margin-top:4px;font-size:12px;color:var(--ink-soft,#7a746a);line-height:1.5}
.gc-perm-acts{margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.gc-perm-btn{padding:5px 10px;font-size:12px;font-family:inherit;border-radius:8px;border:1px solid rgba(179,153,110,.35);background:rgba(255,253,249,.7);color:var(--ink,#4a463e)}
.gc-perm-btn:active{background:rgba(199,173,132,.2)}
.gc-perm-btn-primary{background:linear-gradient(135deg,#c7ad84,#b2925f);color:#fff;border-color:transparent}
.gc-perm-btn-primary:active{filter:brightness(.94)}
.gc-perm-btn-ghost{border-color:rgba(120,110,90,.2);background:transparent;color:var(--ink-soft,#8a8478)}
.gc-perm-badge{font-size:12px;color:#6f9a6f;padding:4px 8px;border-radius:8px;background:rgba(120,180,120,.1)}
.gc-perm-revoked .gc-perm-badge{color:var(--ink-faint,#a8a294);background:rgba(120,110,90,.08)}
.gc-perm-failed .gc-perm-badge{color:#c58b8b;background:rgba(200,130,130,.1)}
.gc-dec{margin-top:8px;padding:11px 12px;border-radius:12px;background:rgba(179,153,110,.08);border:1px solid rgba(179,153,110,.22);font-size:12.5px;color:var(--ink,#4a463e);max-width:min(90%,420px)}
.gc-dec-done{opacity:.8}
.gc-dec-title{font-size:12.5px;font-weight:600}
.gc-dec-opt{display:flex;align-items:flex-start;gap:8px;width:100%;text-align:left;padding:8px 10px;margin-top:6px;border-radius:10px;border:1px solid rgba(179,153,110,.25);background:rgba(255,253,249,.6);color:var(--ink,#4a463e);font-size:12.5px;line-height:1.5;font-family:inherit}
.gc-dec-opt.sel{border-color:#b2925f;background:rgba(199,173,132,.16);box-shadow:0 0 0 1px #b2925f inset}
.gc-dec-key{flex:none;font-weight:700;color:#a8874f}
.gc-dec-label{flex:1}
.gc-dec-rectag{flex:none;font-size:10.5px;color:#a8874f;border:1px solid rgba(179,153,110,.4);border-radius:6px;padding:1px 5px;align-self:center}
.gc-dec-why{margin-top:7px;font-size:12px;color:var(--ink-soft,#7a746a);line-height:1.5}
.gc-dec-note{width:100%;margin-top:8px;padding:7px 9px;border-radius:9px;border:1px solid rgba(179,153,110,.25);background:rgba(255,253,249,.5);font-size:12.5px;font-family:inherit;color:var(--ink,#4a463e);resize:none;outline:none}
.gc-dec-acts{margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.gc-dec-btn{padding:6px 12px;font-size:12px;font-family:inherit;border-radius:8px;border:1px solid rgba(179,153,110,.35);background:rgba(255,253,249,.7);color:var(--ink,#4a463e)}
.gc-dec-btn.primary{background:linear-gradient(135deg,#c7ad84,#b2925f);color:#fff;border-color:transparent}
.gc-dec-btn.primary:active{filter:brightness(.94)}
.gc-dec-btn.ghost{border-color:rgba(120,110,90,.2);background:transparent;color:var(--ink-soft,#8a8478)}
.gc-dec-badge{display:inline-block;margin-top:6px;font-size:12px;color:#6f9a6f;padding:4px 8px;border-radius:8px;background:rgba(120,180,120,.1)}
`
