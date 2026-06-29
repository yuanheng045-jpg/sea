import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppearance, updateAppearance, type Appearance } from './appearance'
import { useChatState, setTextColor } from './chatStore'

type SessionMeta = {
  id: string
  startTs: number
  lastTs: number
  count: number
  preview: string
}

type QuickItem = { key: string; label: string }

const QUICK_ITEMS: QuickItem[] = [
  { key: 'music',   label: '音乐界面' },
  { key: 'reading', label: '共同阅读' },
  { key: 'slot',    label: '摇奖机' },
]

type ViewMsg = { role: string; ts: number; text: string }

export function Sidebar({
  open, onClose, currentSessionId,
}: {
  open: boolean
  onClose: () => void
  currentSessionId: string | null
}) {
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ id: string; loading: boolean; messages: ViewMsg[] } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const appearance = useAppearance()
  const { textColors } = useChatState()

  useEffect(() => {
    if (!open || sessions !== null) return
    setLoading(true); setErr(null)
    fetch('/cc-api/api/sessions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(d => setSessions(Array.isArray(d?.sessions) ? d.sessions : []))
      .catch(e => setErr(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [open, sessions])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (viewing) setViewing(null); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, viewing])

  // 锁住下层 body 滚动 / 滑动,避免 sidebar 内手势穿透到 CCPage
  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyTouch = body.style.touchAction
    const prevBodyPos = body.style.position
    const scrollY = window.scrollY
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.touchAction = prevBodyTouch
      body.style.position = prevBodyPos
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  const startX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0]?.clientX ?? null }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - startX.current
    startX.current = null
    if (dx < -60) onClose()
  }

  const openSession = (sid: string) => {
    setViewing({ id: sid, loading: true, messages: [] })
    fetch('/cc-api/api/sessions/' + encodeURIComponent(sid), { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(d => setViewing(v => v && v.id === sid ? { ...v, loading: false, messages: Array.isArray(d?.messages) ? d.messages : [] } : v))
      .catch(() => setViewing(v => v && v.id === sid ? { ...v, loading: false, messages: [] } : v))
  }

  const showToast = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(t => t === msg ? null : t), 1800) }

  if (!open) return null

  const groups = sessions ? groupByDay(sessions) : []

  return createPortal(
    <div className="sb-backdrop" onClick={onClose}>
      <aside
        className="sb-drawer"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <header className="sb-header">
          <span className="sb-title">苏煦</span>
          <button className="sb-close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <section className="sb-section sb-history">
          <div className="sb-section-title">历史对话</div>
          {loading && <div className="sb-loading">载入中…</div>}
          {err && <div className="sb-err">读取失败：{err}</div>}
          {!loading && !err && groups.length === 0 && <div className="sb-empty">还没有历史会话</div>}
          {!loading && !err && groups.map(g => (
            <div key={g.label} className="sb-group">
              <div className="sb-group-label">{g.label}</div>
              {g.items.map(s => (
                <button
                  key={s.id}
                  className={`sb-history-item${s.id === currentSessionId ? ' active' : ''}`}
                  onClick={() => openSession(s.id)}
                  title={s.id}
                >
                  <span className="sb-h-time">{fmtHHMM(s.lastTs)}</span>
                  <span className="sb-h-preview">{s.preview || '(空对话)'}</span>
                  <span className="sb-h-count">{s.count}</span>
                </button>
              ))}
            </div>
          ))}
        </section>

        <section className="sb-section sb-quick">
          <div className="sb-section-title">应用</div>
          <div className="sb-quick-grid">
            {QUICK_ITEMS.map(q => (
              <button key={q.key} className="sb-quick-item" onClick={() => showToast(q.label + '·构建中')}>
                <span className="sb-q-label">{q.label}</span>
                <span className="sb-q-tag">构建中</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sb-section sb-prefs">
          <div className="sb-section-title">设置</div>
          <button
            className={`sb-pref-item sb-pref-accordion${appearanceOpen ? ' open' : ''}`}
            onClick={() => setAppearanceOpen(o => !o)}
            aria-expanded={appearanceOpen}
          >
            <span className="sb-pref-label">外观</span>
            <span className="sb-pref-arrow sb-pref-chevron">{appearanceOpen ? '▾' : '›'}</span>
          </button>
          <div className="sb-accordion" data-state={appearanceOpen ? 'open' : 'closed'}>
            <div className="sb-accordion-inner">
              <AppearancePanel appearance={appearance} textColors={textColors} />
            </div>
          </div>
          <button className="sb-pref-item" onClick={() => showToast('语音设置·构建中')}>
            <span className="sb-pref-label">语音设置</span>
            <span className="sb-pref-arrow">›</span>
          </button>
          <button className="sb-pref-item" onClick={() => showToast('导出对话·构建中')}>
            <span className="sb-pref-label">导出对话</span>
            <span className="sb-pref-arrow">›</span>
          </button>
        </section>
      </aside>

      {viewing && (
        <div className="sb-viewer-backdrop" onClick={() => setViewing(null)}>
          <div className="sb-viewer" onClick={e => e.stopPropagation()}>
            <header className="sb-viewer-head">
              <span className="sb-viewer-title">
                {viewing.id === currentSessionId ? '当前会话' : '历史会话'}
              </span>
              <button className="sb-close" onClick={() => setViewing(null)} aria-label="关闭">×</button>
            </header>
            {viewing.loading ? (
              <div className="sb-loading">载入中…</div>
            ) : (
              <div className="sb-viewer-body">
                {viewing.messages.length === 0 && <div className="sb-empty">没有可显示的消息</div>}
                {viewing.messages.map((m, i) => (
                  <div key={i} className={`sb-vm sb-vm-${m.role}`}>
                    <div className="sb-vm-head">
                      <span className="sb-vm-role">{roleLabel(m.role)}</span>
                      <span className="sb-vm-ts">{fmtHHMM(m.ts)}</span>
                    </div>
                    <div className="sb-vm-text">{m.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="sb-toast">{toast}</div>}
    </div>,
    document.body,
  )
}

function groupByDay(sessions: SessionMeta[]) {
  const now = new Date()
  const todayKey = ymd(now)
  const ydayKey = ymd(new Date(now.getTime() - 86400000))
  const sorted = [...sessions].sort((a, b) => b.lastTs - a.lastTs)
  const groups: { label: string; items: SessionMeta[] }[] = []
  for (const s of sorted) {
    const d = new Date(s.lastTs)
    const key = ymd(d)
    const label = key === todayKey ? '今天' : key === ydayKey ? '昨天' : `${d.getMonth() + 1}-${d.getDate()}`
    let g = groups.find(x => x.label === label)
    if (!g) { g = { label, items: [] }; groups.push(g) }
    g.items.push(s)
  }
  return groups
}

function ymd(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function fmtHHMM(ts: number) {
  const d = new Date(ts)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function roleLabel(r: string): string {
  if (r === 'user') return '原瑶'
  if (r === 'assistant') return '苏煦'
  return r
}


function AppearancePanel({ appearance: a, textColors }: {
  appearance: Appearance
  textColors: { su: string; you: string }
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('图片太大(>2MB),换一张再传')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const next = [...a.bgImages, url]
      updateAppearance({ bgImages: next, bgCurrent: next.length - 1, bgMode: 'image' })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  const delImg = (i: number) => {
    const next = a.bgImages.filter((_, j) => j !== i)
    const cur = Math.max(0, Math.min(a.bgCurrent, next.length - 1))
    updateAppearance({
      bgImages: next,
      bgCurrent: cur,
      bgMode: next.length === 0 && a.bgMode === 'image' ? 'blob' : a.bgMode,
    })
  }
  return (
    <div className="ap-panel">
      <div className="ap-section">
        <div className="ap-label">背景</div>
        <label className={`ap-radio${a.bgMode === 'blob' ? ' on' : ''}`}>
          <input type="radio" name="ap-bg" checked={a.bgMode === 'blob'} onChange={() => updateAppearance({ bgMode: 'blob' })} />
          <span className="ap-radio-text">弥散动画</span>
          <span className="ap-radio-hint">默认 · 4 色 blob</span>
        </label>
        <label className={`ap-radio${a.bgMode === 'color' ? ' on' : ''}`}>
          <input type="radio" name="ap-bg" checked={a.bgMode === 'color'} onChange={() => updateAppearance({ bgMode: 'color' })} />
          <span className="ap-radio-text">纯色</span>
          <input
            type="color"
            className="ap-color-inline"
            value={a.bgColor}
            onChange={e => updateAppearance({ bgColor: e.target.value, bgMode: 'color' })}
            aria-label="纯色背景"
          />
        </label>
        <label className={`ap-radio${a.bgMode === 'image' ? ' on' : ''}`}>
          <input type="radio" name="ap-bg" checked={a.bgMode === 'image'} onChange={() => updateAppearance({ bgMode: 'image' })} />
          <span className="ap-radio-text">图片</span>
          <span className="ap-radio-hint">{a.bgImages.length || 0} 张</span>
        </label>
        {a.bgMode === 'image' && (
          <div className="ap-image-area">
            <div className="ap-thumbs">
              {a.bgImages.map((img, i) => (
                <div key={i} className={`ap-thumb-wrap${i === a.bgCurrent ? ' active' : ''}`}>
                  <button
                    className="ap-thumb"
                    onClick={() => updateAppearance({ bgCurrent: i })}
                    aria-label={`选择第 ${i + 1} 张`}
                  >
                    <img src={img} alt="" />
                  </button>
                  <button
                    className="ap-thumb-del"
                    onClick={(e) => { e.stopPropagation(); delImg(i) }}
                    aria-label={`删除第 ${i + 1} 张`}
                  >×</button>
                </div>
              ))}
              <button className="ap-thumb ap-thumb-add" onClick={() => fileRef.current?.click()} aria-label="上传图片">+</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
            </div>
            {a.bgImages.length > 0 && (
              <div className="ap-dim-row">
                <span className="ap-dim-label">压暗</span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={a.bgDim}
                  onChange={e => updateAppearance({ bgDim: Number(e.target.value) })}
                  className="ap-range"
                  aria-label="背景压暗"
                />
                <span className="ap-dim-val">{a.bgDim}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ap-section">
        <div className="ap-toggle-row">
          <span className="ap-label">气泡</span>
          <button
            className={`ap-toggle${a.bubbles ? ' on' : ''}`}
            onClick={() => updateAppearance({ bubbles: !a.bubbles })}
            role="switch"
            aria-checked={a.bubbles}
            aria-label="显示气泡"
          ><span className="ap-toggle-knob" /></button>
        </div>
        <div className="ap-hint">{a.bubbles ? '磨砂气泡 · 双方同色 · 静态防发热' : '默认 · 头像加文字'}</div>
      </div>

      <div className="ap-section">
        <div className="ap-label">文字颜色</div>
        <label className="ap-color-row">
          <input type="color" value={textColors.su} onChange={e => setTextColor('su', e.target.value)} aria-label="苏煦颜色" />
          <span>苏煦</span>
        </label>
        <label className="ap-color-row">
          <input type="color" value={textColors.you} onChange={e => setTextColor('you', e.target.value)} aria-label="原瑶颜色" />
          <span>原瑶</span>
        </label>
      </div>
    </div>
  )
}
