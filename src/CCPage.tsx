import { useEffect, useRef, useState, Fragment } from 'react'
import { IconSlot } from './IconSlot'
import {
  useChatState,
  loadMoreMessages,
  clearAutoExpanded,
  sendMessage,
  sendRaw,
  sendSessionAction,
  setHintsEnabled,
  setHealthEnabled,
  setTextColor,
  sendClaudemdGet,
  sendClaudemdSave,
  type ChatMessage,
} from './chatStore'

const SWIPE_THRESHOLD = 60
const MAX_CONTEXT_TOKENS = 750_000
const CC_MODELS = [
  { value: 'claude-opus-4-8[1m]', label: 'Opus 4.8' },
  { value: 'claude-opus-4-7[1m]', label: 'Opus 4.7' },
  { value: 'claude-opus-4-6[1m]', label: 'Opus 4.6' },
  { value: 'claude-opus-4-5[1m]', label: 'Opus 4.5' },
  { value: 'claude-sonnet-4-6[1m]', label: 'Sonnet 4.6' },
  { value: 'claude-sonnet-4-5[1m]', label: 'Sonnet 4.5' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  { value: 'claude-fable-5', label: 'Fable 5' },
]
const STYLES_KEY = 'sea-userstyles'

export function CCPage({ onBack }: { onBack: () => void }) {
  const {
    messages, connected, authed, ccAlive, ccBusy,
    streamingPhase, streamingElapsed, sessionState,
    hintsEnabled, healthEnabled, textColors, claudemd, visibleCount,
  } = useChatState()
  const visibleMessages = messages.slice(-visibleCount)
  const hasMore = messages.length > visibleCount
  const [draft, setDraft] = useState('')
  const [plusOpen, setPlusOpen] = useState(false)
  const [moonFull, setMoonFull] = useState(false)
  const [styleEditorOpen, setStyleEditorOpen] = useState(false)
  const [editingStyle, setEditingStyle] = useState<'c' | 'f'>('c')
  const [styleTexts, setStyleTexts] = useState<{ c: string; f: string }>({ c: '', f: '' })
  const [panelOpen, setPanelOpen] = useState(false)
  const [claudemdOpen, setClaudemdOpen] = useState(false)
  const [claudemdDraft, setClaudemdDraft] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<'photo' | 'file' | null>(null)
  const [pendingImages, setPendingImages] = useState<File[] | null>(null)
  const [attachments, setAttachments] = useState<Array<{ kind: 'image' | 'file'; url: string; name?: string }>>([])
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sentinelRef.current || !listRef.current || !hasMore) return
    const listEl = listRef.current
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        const prevHeight = listEl.scrollHeight
        const prevTop = listEl.scrollTop
        loadMoreMessages()
        requestAnimationFrame(() => {
          const newHeight = listEl.scrollHeight
          listEl.scrollTop = prevTop + (newHeight - prevHeight)
        })
      }
    }, { root: listEl, threshold: 0 })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore])

  // 加载 user styles：先 localStorage 即时显示，再 fetch /api/status 拉服务端最新值覆盖
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STYLES_KEY)
      if (raw) setStyleTexts(JSON.parse(raw))
    } catch {}
    fetch('/api/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const v = data?.['sea-userstyles']?.value
        if (v && typeof v === 'object') {
          const next = { c: typeof v.c === 'string' ? v.c : '', f: typeof v.f === 'string' ? v.f : '' }
          setStyleTexts(next)
          try { localStorage.setItem(STYLES_KEY, JSON.stringify(next)) } catch {}
        }
      })
      .catch(() => {})
  }, [])

  const styleSaveTimer = useRef<number | undefined>(undefined)
  const saveStyle = (k: 'c' | 'f', text: string) => {
    const next = { ...styleTexts, [k]: text }
    setStyleTexts(next)
    try { localStorage.setItem(STYLES_KEY, JSON.stringify(next)) } catch {}
    if (styleSaveTimer.current) window.clearTimeout(styleSaveTimer.current)
    styleSaveTimer.current = window.setTimeout(() => {
      fetch('/api/status/sea-userstyles', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      }).catch(() => {})
    }, 600)
  }

  const initialScrollDoneRef = useRef(false)
  useEffect(() => {
    const el = listRef.current
    if (!el || messages.length === 0) return
    if (initialScrollDoneRef.current) {
      // 后续：用户在底部时新消息自动跟，否则不打扰
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
      if (isAtBottom) el.scrollTop = el.scrollHeight
      return
    }
    // 首次：图片/字体陆续加载导致 scrollHeight 持续增长，强制每 80ms 滚到底直到稳定（用户主动滚则停）
    const scrollDown = () => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }
    scrollDown()
    let userScrolled = false
    const onUserScroll = () => { userScrolled = true }
    el.addEventListener('wheel', onUserScroll, { passive: true })
    el.addEventListener('touchmove', onUserScroll, { passive: true })
    const interval = setInterval(() => { if (!userScrolled) scrollDown() }, 80)
    const stopTimer = setTimeout(() => {
      clearInterval(interval)
      el.removeEventListener('wheel', onUserScroll)
      el.removeEventListener('touchmove', onUserScroll)
      initialScrollDoneRef.current = true
    }, 2500)
    return () => {
      clearInterval(interval)
      clearTimeout(stopTimer)
      el.removeEventListener('wheel', onUserScroll)
      el.removeEventListener('touchmove', onUserScroll)
    }
  }, [messages.length])

  useEffect(() => {
    if (!taRef.current) return
    taRef.current.style.height = 'auto'
    taRef.current.style.height = Math.min(140, taRef.current.scrollHeight) + 'px'
  }, [draft])

  useEffect(() => {
    if (claudemdOpen && authed) {
      sendClaudemdGet()
    }
  }, [claudemdOpen, authed])

  useEffect(() => {
    if (claudemdOpen && claudemd.content !== null) {
      setClaudemdDraft(claudemd.content)
    }
  }, [claudemdOpen, claudemd.content])

  useEffect(() => {
    if (panelOpen && authed) {
      sendRaw({ type: 'session_subscribe' })
      return () => { sendRaw({ type: 'session_unsubscribe' }) }
    }
  }, [panelOpen, authed])

  useEffect(() => {
    let startX = 0, startY = 0, tracking = false
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('textarea, button, input, .cc-moon, .cc-modal, .cc-input-bar')) return
      startX = e.clientX
      startY = e.clientY
      tracking = true
    }
    const onUp = (e: PointerEvent) => {
      if (!tracking) return
      tracking = false
      // 用户选中了文本（复制粘贴中）→ 不识别为返回手势
      const sel = window.getSelection()
      if (sel && sel.toString().trim().length > 0) return
      const dx = e.clientX - startX
      const dy = Math.abs(e.clientY - startY)
      if (dx > SWIPE_THRESHOLD && dy < 60) onBack()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !styleEditorOpen && !panelOpen) onBack()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [onBack, styleEditorOpen, panelOpen])

  const onSend = () => {
    const text = draft.trim()
    const active = (moonFull ? styleTexts.f : styleTexts.c).trim()
    if (!text && attachments.length === 0) return
    const images = attachments.filter((a) => a.kind === 'image').map((a) => a.url)
    const files = attachments.filter((a) => a.kind === 'file').map((a) => ({ url: a.url, name: a.name }))
    const extra: any = {}
    if (active) extra.style = active
    if (images.length) extra.images = images
    if (files.length) extra.files = files
    sendMessage(text, Object.keys(extra).length ? extra : undefined)
    setDraft('')
    setAttachments([])
  }

  const toggleThinking = (id: string, isAutoExpanded: boolean) => {
    if (isAutoExpanded) {
      // 当前因 autoExpanded 展开 → 点击应该折叠 → 清掉 autoExpanded
      clearAutoExpanded(id)
      return
    }
    setExpandedThinking((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 状态 800ms debounce：瞬断不闪"连接中"
  const [stableConnected, setStableConnected] = useState(connected)
  const [stableAuthed, setStableAuthed] = useState(authed)
  useEffect(() => {
    if (connected && authed) {
      setStableConnected(true); setStableAuthed(true)
      return
    }
    const t = window.setTimeout(() => {
      setStableConnected(connected); setStableAuthed(authed)
    }, 800)
    return () => window.clearTimeout(t)
  }, [connected, authed])

  const statusText = !stableConnected
    ? '连接中'
    : !stableAuthed
    ? '鉴权中'
    : ccBusy
    ? streamingPhase === 'thinking' && typeof streamingElapsed === 'number'
      ? `正在想 ${streamingElapsed}s`
      : '正在打字'
    : ccAlive
    ? '在线'
    : '离线'
  const statusClass = ccBusy ? 'busy' : ccAlive ? 'alive' : 'offline'

  return (
    <div className="cc-page">
      <header className="cc-top">
        <div className="cc-top-left">
          <span className={`cc-status-dot ${statusClass}`} />
          <span className="cc-name" onClick={() => setClaudemdOpen(true)} title="编辑 CLAUDE.md">苏煦</span>
          {statusClass !== 'alive' && (
            <span className={`cc-status-text ${statusClass}`}>{statusText}</span>
          )}
        </div>
        <button
          className="cc-moon"
          onClick={() => setMoonFull((v) => !v)}
          onDoubleClick={() => setStyleEditorOpen(true)}
          aria-label="单击切换 style · 双击编辑"
          title="单击切换 style · 双击编辑"
        >
          <MoonSvg full={moonFull} />
        </button>
        <button
          className="cc-whale-btn"
          onClick={() => setPanelOpen(true)}
          aria-label="面板"
        >
          <WhaleSvg />
        </button>
      </header>
      <div className="cc-waterline" />

      <div className="cc-messages" ref={listRef}>
        {hasMore && <div ref={sentinelRef} className="cc-load-sentinel" />}
        {messages.length === 0 && connected && authed && (
          <div className="cc-empty">还没消息</div>
        )}
        {visibleMessages.map((m) => (
          <Fragment key={m.id}>
            <MessageRow
              message={m}
              expanded={expandedThinking.has(m.id) || !!m.autoExpanded}
              onToggleThinking={() => toggleThinking(m.id, !!m.autoExpanded)}
            />
            {m.role === 'user' && m.memoryHits && m.memoryHits.length > 0 && (
              <details className="cc-memory-hits">
                <summary>💡 命中 {m.memoryHits.length} 条记忆</summary>
                <ul>
                  {m.memoryHits.map((h: any, i: number) => (
                    <li key={h.short_id || h.id || i}>
                      <span className="cc-memory-id">[{h.short_id || h.id}]</span>{' '}
                      {h.date ? <span className="cc-memory-date">{h.date}</span> : null}{' '}
                      <span className="cc-memory-summary">{h.summary || ''}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Fragment>
        ))}
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length === 0) return
          setPlusOpen(false)
          setPendingImages(files)
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          setUploading('file'); setPlusOpen(false)
          try {
            const { url, name } = await uploadToHub(f)
            setAttachments((prev) => [...prev, { kind: 'file', url, name }])
          } catch (err) { console.error('file upload failed', err); alert('文件上传失败') }
          finally { setUploading(null); e.target.value = '' }
        }}
      />
      <div className="cc-input-bar">
        <div className="cc-input-col">
        {attachments.length > 0 && (
          <div className="cc-attach-row">
            {attachments.map((att, i) => (
              <div className="cc-attach" key={i}>
                {att.kind === 'image'
                  ? <img className="cc-attach-thumb" src={`https://cc.atlantis-sy.blue${att.url}`} alt="" />
                  : <span className="cc-attach-file"><FileIconInline />{att.name}</span>}
                <button className="cc-attach-del" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} aria-label="移除附件">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="cc-input-pill">
          <div className="cc-plus-wrap">
            {plusOpen && (
              <div className="cc-plus-menu">
                <button
                  className="cc-plus-item"
                  aria-label="图片"
                  disabled={uploading !== null}
                  onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click() }}
                ><PhotoSvg /></button>
                <button
                  className="cc-plus-item"
                  aria-label="文件"
                  disabled={uploading !== null}
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                ><FileSvg /></button>
                <button
                  className={`cc-plus-item hints${hintsEnabled ? ' on' : ' off'}`}
                  onClick={(e) => { e.stopPropagation(); setHintsEnabled(!hintsEnabled) }}
                  aria-label={`命中记忆 ${hintsEnabled ? '开启' : '关闭'}`}
                  title={`命中记忆：${hintsEnabled ? '开' : '关'}`}
                >
                  <HintsSvg />
                </button>
                <button
                  className={`cc-plus-item health${healthEnabled ? ' on' : ' off'}`}
                  onClick={(e) => { e.stopPropagation(); setHealthEnabled(!healthEnabled) }}
                  aria-label={`心率注入 ${healthEnabled ? '开启' : '关闭'}`}
                  title={`心率：${healthEnabled ? '开' : '关'}`}
                >
                  <HeartSvg />
                </button>
              </div>
            )}
            <button
              className={`cc-plus${plusOpen ? ' open' : ''}`}
              onClick={() => setPlusOpen((v) => !v)}
              aria-label="附件"
            >
              <PlusSvg />
            </button>
          </div>
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
          />
          <button
            className="cc-send"
            onClick={onSend}
            disabled={(!draft.trim() && attachments.length === 0) || !authed}
            aria-label="发送"
          >
            <ClaudeSparkle />
          </button>
        </div>
        </div>
      </div>

      {styleEditorOpen && (
        <div className="cc-modal-backdrop" onClick={() => setStyleEditorOpen(false)}>
          <div className="cc-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="cc-modal-title">user style</div>
            <div className="cc-style-tabs">
              <button
                className={`cc-style-tab${editingStyle === 'c' ? ' active' : ''}`}
                onClick={() => setEditingStyle('c')}
              >弯月</button>
              <button
                className={`cc-style-tab${editingStyle === 'f' ? ' active' : ''}`}
                onClick={() => setEditingStyle('f')}
              >满月</button>
            </div>
            <textarea
              className="cc-modal-input"
              value={styleTexts[editingStyle]}
              onChange={(e) => saveStyle(editingStyle, e.target.value)}
              placeholder={`${editingStyle === 'c' ? '弯月' : '满月'} 的 user style，写你想要的语气、口吻、规则…`}
              rows={6}
            />
            <div className="cc-modal-actions">
              <button onClick={() => setStyleEditorOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {claudemdOpen && (
        <ClaudemdModal
          draft={claudemdDraft}
          loading={claudemd.content === null}
          lastSave={claudemd.lastSave}
          onChange={setClaudemdDraft}
          onSave={() => sendClaudemdSave(claudemdDraft)}
          onClose={() => setClaudemdOpen(false)}
        />
      )}

      {panelOpen && (
        <SessionPanel
          state={sessionState}
          textColors={textColors}
          onClose={() => setPanelOpen(false)}
          onAction={(a) => sendSessionAction(a)}
          onColorChange={(who, c) => setTextColor(who, c)}
        />
      )}

      {pendingImages && (
        <CompressDialog
          files={pendingImages}
          progress={uploadProgress}
          onCancel={() => { setPendingImages(null); setUploadProgress(null) }}
          onPick={async (level) => {
            const files = pendingImages ?? []
            if (!files.length) { setPendingImages(null); return }
            setUploadProgress({ done: 0, total: files.length })
            try {
              for (let i = 0; i < files.length; i++) {
                const f = files[i]
                let toUpload: Blob | File = f
                let mime = f.type
                let filename = f.name
                if (level !== 'orig') {
                  const lv = COMP_LEVELS.find((x) => x.key === level)!
                  const blob = await compressImage(f, lv.q, lv.dim)
                  if (blob) { toUpload = blob; mime = 'image/jpeg'; filename = f.name.replace(/\.\w+$/, '.jpg') }
                }
                const { url } = await uploadBlobToHub(toUpload, mime, filename)
                setAttachments((prev) => [...prev, { kind: 'image', url }])
                setUploadProgress({ done: i + 1, total: files.length })
              }
            } catch (err) {
              console.error('photo upload failed', err)
              alert('图片上传失败')
            } finally {
              setPendingImages(null); setUploadProgress(null)
            }
          }}
        />
      )}
    </div>
  )
}

function MessageRow({ message, expanded, onToggleThinking }: {
  message: ChatMessage
  expanded: boolean
  onToggleThinking: () => void
}) {
  if (message.role === 'activity') {
    const acts = message.activities ?? []
    const tools = acts.map((a: any) => a.tool || a.name).filter(Boolean)
    if (tools.length === 0) return null
    return (
      <div className="cc-activity-inline">
        {tools.map((t: string, i: number) => (
          <span key={i} className="cc-tool-chip">{t}</span>
        ))}
      </div>
    )
  }
  const text =
    typeof message.content === 'string' ? message.content
    : message.content ? JSON.stringify(message.content) : ''
  const isAssistant = message.role === 'assistant'
  const hasThinking = isAssistant && typeof message.thinking === 'string' && message.thinking.length > 0
  return (
    <div className={`cc-msg ${message.role}${message.pending ? ' pending' : ''}`}>
      <div className="cc-avatar-col">
        <IconSlot
          iconKey={message.role === 'assistant' ? 'avatar-su' : 'avatar-you'}
          fallback={<span className={`cc-avatar-fallback ${message.role}`} />}
          className="cc-avatar-slot"
        />
      </div>
      <div className="cc-text-col">
        {hasThinking && (
          <button
            className={`cc-thinking-toggle${expanded ? ' open' : ''}`}
            onClick={onToggleThinking}
          >
            <span className="cc-thinking-arrow">›</span> 思考
          </button>
        )}
        {hasThinking && expanded && (
          <div className="cc-thinking-body">{message.thinking}</div>
        )}
        {message.image && (
          <img
            className="cc-msg-img"
            src={`https://cc.atlantis-sy.blue${message.image}`}
            alt=""
            loading="lazy"
            decoding="async"
          />
        )}
        {Array.isArray(message.images) && message.images.map((u: string, i: number) => (
          <img key={i} className="cc-msg-img" src={`https://cc.atlantis-sy.blue${u}`} alt="" loading="lazy" decoding="async" />
        ))}
        {Array.isArray(message.files) && message.files.map((fl: any, i: number) => (
          <a key={i} className="cc-msg-file" href={`https://cc.atlantis-sy.blue${fl.url ?? ''}`} target="_blank" rel="noopener">
            <FileIconInline /> {fl.name ?? '文件'}
          </a>
        ))}
        {message.file && (
          <a
            className="cc-msg-file"
            href={`https://cc.atlantis-sy.blue${(message.file as any).url ?? ''}`}
            target="_blank"
            rel="noopener"
          >
            <FileIconInline /> {(message.file as any).name ?? '文件'}
          </a>
        )}
        {text && (
          <div className="cc-text">
            {text.split(/\n{2,}/).map((para, i, arr) => (
              <p key={i} className="cc-paragraph">
                {para}
                {i === arr.length - 1 && (
                  <span className="cc-msg-time">{formatTsShort(message.ts)}</span>
                )}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTsShort(ms: number | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hm
  const diff = now.getTime() - ms
  if (diff < 86400000 * 2) return `昨天 ${hm}`
  if (diff < 86400000 * 7) return `${['日','一','二','三','四','五','六'][d.getDay()]} ${hm}`
  return `${d.getMonth()+1}/${d.getDate()} ${hm}`
}

// 数据格式化
function kFormat(n: number): string {
  if (!n && n !== 0) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'k'
  return String(n)
}
function shortModel(m: string): string {
  if (!m) return '—'
  const map: Array<[string, string]> = [
    ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'], ['fable', 'Fable'],
  ]
  for (const [k, v] of map) {
    if (m.toLowerCase().includes(k)) {
      const match = m.match(/(\d+)-(\d+)/)
      if (match) return `${v} ${match[1]}.${match[2]}`
      return v
    }
  }
  return m.length > 14 ? m.slice(0, 14) + '…' : m
}
function formatTs(ms: number | undefined): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 5000) return '刚刚'
  if (diff < 60000) return `${Math.floor(diff / 1000)} 秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 时前`
  return new Date(ms).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function SessionPanel({ state, textColors, onClose, onAction, onColorChange }: {
  state: Record<string, any> | null
  textColors: { su: string; you: string }
  onClose: () => void
  onAction: (action: string) => void
  onColorChange: (who: 'su' | 'you', color: string) => void
}) {
  const [confirming, setConfirming] = useState<null | 'forge' | 'compact'>(null)
  const confirmTimerRef = useRef<number | undefined>(undefined)
  const tapAction = (a: 'forge' | 'compact') => {
    if (confirming === a) {
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current)
      setConfirming(null)
      onAction(a === 'forge' ? 'session_forge' : 'session_compact')
      return
    }
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current)
    setConfirming(a)
    confirmTimerRef.current = window.setTimeout(() => setConfirming(null), 3000)
  }
  const contextTokens = state?.contextTokens ?? 0
  const cacheRead = state?.cacheRead ?? 0
  const pct = Math.min(100, (contextTokens / MAX_CONTEXT_TOKENS) * 100)
  const curModel = (state as any)?.desiredModel || state?.model || ''
  const cacheHitPct = contextTokens > 0 ? Math.round((cacheRead / contextTokens) * 100) : 0

  return (
    <div className="cc-modal-backdrop" onClick={onClose}>
      <div className="cc-modal cc-panel glass" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-title">苏煦的会话</div>

        {!state ? (
          <div className="cc-panel-loading">连接中…</div>
        ) : (
          <>
            <div className="cc-panel-section">
              <div className="cc-panel-context-row">
                <span className="cc-panel-context-pct">{Math.round(pct)}%</span>
                <span className="cc-panel-context-detail">{kFormat(contextTokens)} / {kFormat(MAX_CONTEXT_TOKENS)}</span>
              </div>
              <div className="cc-panel-progress">
                <div className="cc-panel-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="cc-panel-context-label">上下文</div>
            </div>

            <div className="cc-panel-cards">
              <div className="cc-panel-card">
                <div className="cc-panel-card-val">{cacheHitPct}%</div>
                <div className="cc-panel-card-label">缓存命中</div>
              </div>
              <div className="cc-panel-card">
                <div className="cc-panel-card-val small">{shortModel(state.model)}</div>
                <div className="cc-panel-card-label">模型</div>
              </div>
            </div>

            <div className="cc-panel-section">
              <div className="cc-panel-section-title">切换模型 · 下条生效</div>
              <select className="cc-model-select" style={{ width: '100%', padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'inherit' }} value={curModel} onChange={(e) => sendSessionAction('session_set_model', { model: e.target.value })}>
                {curModel && !CC_MODELS.some((mm) => mm.value === curModel) ? <option value={curModel}>{shortModel(curModel)}（当前）</option> : null}
                {CC_MODELS.map((mm) => <option key={mm.value} value={mm.value}>{mm.label}</option>)}
              </select>
            </div>

            <div className="cc-panel-meta" title="本轮 token 用量：你打的输入 + 苏煦回复的输出">
              <span>你 {kFormat(state.inputTokens)} · 苏煦 {kFormat(state.outputTokens)}</span>
              <span className="cc-panel-meta-sep">·</span>
              <span>{formatTs(state.ts)}</span>
            </div>
            <div className="cc-panel-meta">
              <span>session {state.sessionId || '—'}</span>
              {state.autoLine ? <><span className="cc-panel-meta-sep">·</span><span>续 {kFormat(state.autoLine)}</span></> : null}
              {state.dangerLine ? <><span className="cc-panel-meta-sep">·</span><span>险 {kFormat(state.dangerLine)}</span></> : null}
            </div>
          </>
        )}

        <div className="cc-panel-divider" />

        <div className="cc-panel-section">
          <div className="cc-panel-section-title">对话颜色</div>
          <div className="cc-color-pickers">
            <label className="cc-color-pick">
              <input
                type="color"
                value={textColors.su}
                onChange={(e) => onColorChange('su', e.target.value)}
              />
              <span>苏煦</span>
            </label>
            <label className="cc-color-pick">
              <input
                type="color"
                value={textColors.you}
                onChange={(e) => onColorChange('you', e.target.value)}
              />
              <span>你</span>
            </label>
          </div>
        </div>

        <div className="cc-modal-actions">
          <button
            className={`cc-panel-action${confirming === 'forge' ? ' confirming' : ''}`}
            onClick={() => tapAction('forge')}
            title="开新窗口续聊：保留最近20条原文，其余存入记忆"
          >{confirming === 'forge' ? '再点确认换窗' : '换窗'}</button>
          <button
            className={`cc-panel-action${confirming === 'compact' ? ' confirming' : ''}`}
            onClick={() => tapAction('compact')}
            title="原生 /compact：同窗口压缩，保留全部脉络、上下文变小（耗时稍长）"
          >{confirming === 'compact' ? '再点确认压缩' : '压缩'}</button>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ====== SVG ======

// 倒挂弯月（凹槽朝下）：mask 下方圆减去 → 剩上方 ∩ 形月牙
function MoonSvg({ full }: { full: boolean }) {
  const id = full ? 'moon-mask-f' : 'moon-mask-c'
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={`moon-svg ${full ? 'full' : 'crescent'}`}>
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          {!full && <circle cx="12" cy="7" r="7.5" fill="black" />}
        </mask>
      </defs>
      <circle cx="12" cy="12" r="9" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  )
}

function ClaudeSparkle() {
  return (
    <svg viewBox="0 0 100 100" width="22" height="22" className="claude-sparkle">
      <path
        d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function PlusSvg() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="plus-svg">
      <path d="M12 5 L12 19 M5 12 L19 12" />
    </svg>
  )
}

function PhotoSvg() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M3 17 L9 12 L13 15 L17 11 L21 14" />
    </svg>
  )
}

function FileSvg() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M6 3 L14 3 L20 9 L20 21 L6 21 Z" />
      <path d="M14 3 L14 9 L20 9" />
    </svg>
  )
}

function HintsSvg() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M 9 16 Q 6 14 6 10 A 6 6 0 1 1 18 10 Q 18 14 15 16 L 15 18 L 9 18 Z" />
      <path d="M 10 20 L 14 20" />
      <path d="M 11 22 L 13 22" />
    </svg>
  )
}

function HeartSvg() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 21s-7-4.5-9.5-9.5C0.5 7 4 3 7.5 3c2 0 3.5 1 4.5 2.5C13 4 14.5 3 16.5 3 20 3 23.5 7 21.5 11.5 19 16.5 12 21 12 21z" />
    </svg>
  )
}

function WhaleSvg() {
  return (
    <svg viewBox="0 0 52 32" width="42" height="26" className="whale-svg" aria-hidden>
      <path
        d="M 14 22 Q 10 14 18 9 Q 30 5 40 10 Q 47 14 45 21 Q 40 26 28 26 Q 18 26 14 22 Z"
        fill="rgba(20,106,255,0.22)"
      />
      <path
        d="M 18 22 Q 28 28 40 22 Q 38 26 28 26 Q 19 26 18 22 Z"
        fill="rgba(255,255,255,0.32)"
      />
      <path
        d="M 14 20 L 4 12 Q 6 16 4 22 L 14 22 Z"
        fill="rgba(20,106,255,0.24)"
      />
      <path d="M 4 12 L 1 8 L 3 13 Z" fill="rgba(20,106,255,0.18)" />
      <path d="M 4 22 L 1 26 L 3 22 Z" fill="rgba(20,106,255,0.18)" />
      <path
        d="M 37 21 Q 40 23 43 21"
        stroke="rgba(20,106,255,0.55)" strokeWidth="0.7" fill="none" strokeLinecap="round"
      />
      <circle cx="36" cy="15" r="1.3" fill="rgba(20,106,255,0.55)" />
      <circle cx="36.4" cy="14.7" r="0.45" fill="rgba(255,255,255,0.9)" />
      <g>
        <path d="M 28 9 L 28 3" stroke="rgba(20,106,255,0.5)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <path d="M 26 7 L 24 2" stroke="rgba(20,106,255,0.45)" strokeWidth="0.9" strokeLinecap="round" fill="none" />
        <path d="M 30 7 L 32 2" stroke="rgba(20,106,255,0.45)" strokeWidth="0.9" strokeLinecap="round" fill="none" />
        <circle cx="28" cy="1.5" r="0.55" fill="rgba(20,106,255,0.40)" />
        <circle cx="25" cy="0.8" r="0.4" fill="rgba(20,106,255,0.35)" />
        <circle cx="31" cy="0.8" r="0.4" fill="rgba(20,106,255,0.35)" />
        <animateTransform attributeName="transform" type="translate" values="0,0; 0,-1; 0,0" dur="2.8s" repeatCount="indefinite" />
      </g>
    </svg>
  )
}


async function uploadToHub(file: File): Promise<{ url: string; name: string }> {
  const dataB64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const result = r.result as string
      resolve(result.split(',')[1] ?? '')
    }
    r.onerror = () => reject(new Error('FileReader failed'))
    r.readAsDataURL(file)
  })
  const pin = localStorage.getItem('sea-channel-pin') ?? ''
  const res = await fetch('/cc-api/api/upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Channel-Pin': pin },
    body: JSON.stringify({
      data: dataB64,
      mime: file.type || 'application/octet-stream',
      filename: file.name,
    }),
  })
  if (!res.ok) throw new Error('upload HTTP ' + res.status)
  return res.json()
}

function FileIconInline() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }}>
      <path d="M6 3 L14 3 L20 9 L20 21 L6 21 Z" />
      <path d="M14 3 L14 9 L20 9" />
    </svg>
  )
}

function ClaudemdModal({
  draft, loading, lastSave, onChange, onSave, onClose,
}: {
  draft: string
  loading: boolean
  lastSave: 'ok' | 'fail' | null
  onChange: (v: string) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="cc-modal-backdrop" onClick={onClose}>
      <div className="cc-modal cc-claudemd glass" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-title">编辑 苏煦 · CLAUDE.md</div>
        {loading ? (
          <div className="cc-panel-loading">加载中</div>
        ) : (
          <textarea
            className="cc-modal-input cc-claudemd-input"
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            rows={14}
            spellCheck={false}
          />
        )}
        {lastSave === 'ok' && <div className="cc-claudemd-hint ok">已保存，下次开新会话生效</div>}
        {lastSave === 'fail' && <div className="cc-claudemd-hint fail">保存失败</div>}
        <div className="cc-modal-actions">
          <button className="cc-panel-action" onClick={onSave} disabled={loading}>保存</button>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}


const COMP_LEVELS: Array<{ key: '高' | '中' | '低'; q: number; dim: number }> = [
  { key: '高', q: 0.85, dim: 2560 },
  { key: '中', q: 0.60, dim: 1920 },
  { key: '低', q: 0.40, dim: 1280 },
]

function fmtMB(bytes: number): string {
  return bytes < 1048576
    ? (bytes / 1024).toFixed(0) + ' KB'
    : (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + ' MB'
}

function compressImage(file: File, quality: number, maxDim: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (maxDim && (w > maxDim || h > maxDim)) {
        const r = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * r); h = Math.round(h * r)
      }
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(img.src); resolve(null); return }
      ctx.drawImage(img, 0, 0, w, h)
      cv.toBlob((bl) => { URL.revokeObjectURL(img.src); resolve(bl) }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(null) }
    img.src = URL.createObjectURL(file)
  })
}

async function uploadBlobToHub(blob: Blob | File, mime: string, filename: string): Promise<{ url: string; name: string }> {
  const dataB64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('FileReader'))
    r.readAsDataURL(blob)
  })
  const pin = localStorage.getItem('sea-channel-pin') ?? ''
  const res = await fetch('/cc-api/api/upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Channel-Pin': pin },
    body: JSON.stringify({ data: dataB64, mime: mime || 'application/octet-stream', filename }),
  })
  if (!res.ok) throw new Error('upload HTTP ' + res.status)
  return res.json()
}

function CompressDialog({
  files, progress, onCancel, onPick,
}: {
  files: File[]
  progress: { done: number; total: number } | null
  onCancel: () => void
  onPick: (level: 'orig' | '高' | '中' | '低') => void
}) {
  const [levelSizes, setLevelSizes] = useState<Record<string, number | 'wait' | 'fail'>>({ '高': 'wait', '中': 'wait', '低': 'wait' })
  const origTotal = files.reduce((s, f) => s + f.size, 0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const lv of COMP_LEVELS) {
        let total = 0
        for (const f of files) {
          const b = await compressImage(f, lv.q, lv.dim)
          if (cancelled) return
          if (!b) { setLevelSizes((s) => ({ ...s, [lv.key]: 'fail' })); break }
          total += b.size
        }
        if (cancelled) return
        setLevelSizes((s) => (s[lv.key] === 'fail' ? s : { ...s, [lv.key]: total }))
      }
    })()
    return () => { cancelled = true }
  }, [files])

  const busy = progress !== null
  return (
    <div className="cc-modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="cc-modal cc-compress glass" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-title">
          图片 · {files.length} 张 · 共 {fmtMB(origTotal)}
        </div>
        <div className="cc-compress-opts">
          <button
            className="cc-compress-btn"
            onClick={() => onPick('orig')}
            disabled={busy}
          >
            <span>原图发送</span>
            <span className="cc-compress-size">{fmtMB(origTotal)}</span>
          </button>
          {COMP_LEVELS.map((lv) => {
            const sz = levelSizes[lv.key]
            const label = sz === 'wait' ? '压缩中…' : sz === 'fail' ? '失败' : fmtMB(sz)
            return (
              <button
                key={lv.key}
                className="cc-compress-btn"
                onClick={() => onPick(lv.key)}
                disabled={busy || sz === 'wait' || sz === 'fail'}
              >
                <span>{lv.key} 压缩</span>
                <span className="cc-compress-size">{label}</span>
              </button>
            )
          })}
        </div>
        {progress && (
          <div className="cc-compress-progress">
            上传 {progress.done} / {progress.total}
          </div>
        )}
        <div className="cc-modal-actions">
          <button onClick={onCancel} disabled={busy}>取消</button>
        </div>
      </div>
    </div>
  )
}
