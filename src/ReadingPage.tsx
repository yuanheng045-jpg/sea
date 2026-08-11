import { useState, useEffect, useRef, useCallback } from 'react'
import type { Page } from './App'
import * as ccStore from './chatStore'
import * as apiStore from './apiChat'
import type { ChatMessage } from './chatStore'

type Book = { id: string; title: string; author: string; source_url: string; cover: string; last_chapter: number; chapter_count: number; last_read_at: string }
type ChapterItem = { chapter_num: number; title: string }
type Ann = { id: string; original_text: string; annotation: string; annotator: string; created_at: string }
type AO3Result = { id: string; title: string; author: string; fandoms: string[]; summary: string; words: string; kudos: string; chapters: string; language: string }

type View =
  | { kind: 'shelf' }
  | { kind: 'toc'; book: Book; chapters: ChapterItem[] }
  | { kind: 'reader'; book: Book; cnum: number; total: number }
  | { kind: 'discover' }

const API = '/api/reading'
const CH_KEY = 'sea-reading-channel'
const ANNOTATION_HINT_KEY = 'sea-reading-annotation-hint-v1'

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  let data: any
  try { data = text ? JSON.parse(text) : {} } catch { throw new Error('服务返回了无法识别的内容') }
  if (!response.ok || data.error) throw new Error(data.error || `请求失败（${response.status}）`)
  return data
}

function coverColor(title: string) {
  let hash = 0
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return `hsl(${hash} 35% 42%)`
}

export function ReadingPage({ onBack }: { onBack: (p: Page) => void }) {
  const [view, setView] = useState<View>({ kind: 'shelf' })
  const [books, setBooks] = useState<Book[]>([])
  const [chapter, setChapter] = useState<{ title: string; content: string } | null>(null)
  const [anns, setAnns] = useState<Ann[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [selection, setSelection] = useState('')
  const [uploading, setUploading] = useState(false)
  const [importStage, setImportStage] = useState('')
  const [updatingBook, setUpdatingBook] = useState<string | null>(null)
  const [showAnnotationHint, setShowAnnotationHint] = useState(false)
  const [annPopup, setAnnPopup] = useState<{ ann: Ann; x: number; y: number } | null>(null)
  const [chatChannel, setChatChannel] = useState<'cc' | 'api'>(() => {
    try { return (localStorage.getItem(CH_KEY) as 'cc' | 'api') || 'cc' } catch { return 'cc' }
  })
  const logRef = useRef<HTMLDivElement>(null)
  const importTimers = useRef<number[]>([])
  const annotationHintTimer = useRef<number | null>(null)
  const annotationHintShown = useRef(false)

  // discover state
  const [discoverTab, setDiscoverTab] = useState<'ao3' | 'link'>('ao3')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<AO3Result[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [importingLink, setImportingLink] = useState(false)
  const [expandedResult, setExpandedResult] = useState<string | null>(null)

  const store = chatChannel === 'api' ? apiStore : ccStore
  const { messages, ccBusy, connected, authed } = store.useChatState()
  const recentMsgs = messages.filter((m: ChatMessage) => m.role !== 'activity').slice(-30)

  const clearImportStages = () => {
    importTimers.current.forEach(window.clearTimeout)
    importTimers.current = []
    setImportStage('')
  }

  const startImportStages = (first = '下载中…') => {
    clearImportStages()
    setImportStage(first)
    importTimers.current = [
      window.setTimeout(() => setImportStage('解析中…'), 1200),
      window.setTimeout(() => setImportStage('入库中…'), 3800),
    ]
  }

  useEffect(() => () => {
    importTimers.current.forEach(window.clearTimeout)
    if (annotationHintTimer.current !== null) window.clearTimeout(annotationHintTimer.current)
  }, [])

  useEffect(() => {
    if (chatOpen && chatChannel === 'api') apiStore.initApi()
    if (chatOpen && chatChannel === 'cc') ccStore.getChatClientOrInit({})
  }, [chatOpen, chatChannel])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [recentMsgs.length, recentMsgs[recentMsgs.length - 1]?.content])

  const switchChannel = (ch: 'cc' | 'api') => {
    setChatChannel(ch)
    try { localStorage.setItem(CH_KEY, ch) } catch {}
  }

  const fetchBooks = useCallback(() => {
    fetch(`${API}/books`).then(r => r.json()).then(d => setBooks(d.books || []))
  }, [])
  useEffect(() => { fetchBooks() }, [fetchBooks])

  const openBook = (book: Book) => {
    fetch(`${API}/books/${book.id}/chapters`).then(r => r.json()).then(d => {
      setView({ kind: 'toc', book: d.book, chapters: d.chapters || [] })
    })
  }

  const dismissAnnotationHint = () => {
    setShowAnnotationHint(false)
    if (annotationHintTimer.current !== null) window.clearTimeout(annotationHintTimer.current)
    annotationHintTimer.current = null
    try { localStorage.setItem(ANNOTATION_HINT_KEY, '1') } catch {}
  }

  const showAnnotationHintOnce = () => {
    if (annotationHintShown.current) return
    try { if (localStorage.getItem(ANNOTATION_HINT_KEY)) return } catch {}
    annotationHintShown.current = true
    setShowAnnotationHint(true)
    annotationHintTimer.current = window.setTimeout(dismissAnnotationHint, 5000)
  }

  const openChapter = (book: Book, cnum: number, total: number) => {
    fetch(`${API}/books/${book.id}/chapters/${cnum}`).then(r => r.json()).then(d => {
      setChapter(d.chapter)
      setAnns(d.annotations || [])
      setView({ kind: 'reader', book, cnum, total: d.totalChapters || total })
      setChatOpen(false)
      setSelection('')
      showAnnotationHintOnce()
    })
  }

  const deleteBook = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation()
    if (!confirm(`删掉《${book.title}》？批注和共读记录会一起删掉，无法恢复。`)) return
    requestJson(`${API}/books/${book.id}`, { method: 'DELETE' })
      .then(() => fetchBooks())
      .catch(e => alert(e.message))
  }

  const uploadBookFile = (file: File) => {
    const isTxt = file.name.toLowerCase().endsWith('.txt')
    const isEpub = file.name.toLowerCase().endsWith('.epub')
    if (!isTxt && !isEpub) { alert('只支持 EPUB 或 TXT 文件'); return }
    setUploading(true)
    startImportStages('读取文件中…')
    const fd = new FormData()
    fd.append(isTxt ? 'txt' : 'epub', file)
    requestJson(isTxt ? '/api/import-txt' : '/api/import-epub', { method: 'POST', body: fd })
      .then(d => {
        fetchBooks()
        openBook({ id: d.book_id, title: d.title, author: d.author || '', source_url: '', cover: d.cover || '', last_chapter: 0, chapter_count: d.chapters, last_read_at: '' })
      })
      .catch(e => alert(e.message))
      .finally(() => { setUploading(false); clearImportStages() })
  }

  // ── discover: search ──
  const doSearch = () => {
    if (!searchQ.trim() || searching) return
    setSearching(true)
    setSearchError('')
    setSearchResults([])
    setExpandedResult(null)
    fetch(`${API}/search?q=${encodeURIComponent(searchQ.trim())}&source=ao3`)
      .then(r => r.json())
      .then(d => {
        setSearching(false)
        if (d.error) setSearchError(d.error)
        setSearchResults(d.results || [])
      })
      .catch(e => { setSearching(false); setSearchError(e.message) })
  }

  const importAO3 = (workId: string) => {
    setImportingId(workId)
    startImportStages()
    requestJson(`${API}/import-ao3`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_id: workId })
    })
      .then(d => {
        fetchBooks()
        alert(`《${d.title}》已导入，共 ${d.chapters} 章`)
        setView({ kind: 'shelf' })
      })
      .catch(e => alert(e.message))
      .finally(() => { setImportingId(null); clearImportStages() })
  }

  const importFromUrl = () => {
    if (!linkUrl.trim() || importingLink) return
    setImportingLink(true)
    startImportStages()
    requestJson(`${API}/import-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: linkUrl.trim() })
    })
      .then(d => {
        fetchBooks()
        setLinkUrl('')
        alert(`《${d.title}》已导入，共 ${d.chapters} 章`)
        setView({ kind: 'shelf' })
      })
      .catch(e => alert(e.message))
      .finally(() => { setImportingLink(false); clearImportStages() })
  }

  const updateFromAO3 = (book: Book) => {
    if (updatingBook) return
    setUpdatingBook(book.id)
    startImportStages()
    requestJson(`${API}/books/${book.id}/update`, { method: 'POST' })
      .then(d => {
        alert(d.added ? `追到 ${d.added} 个新章节，现在共 ${d.total} 章` : `已经是最新，共 ${d.total} 章`)
        openBook(book)
        fetchBooks()
      })
      .catch(e => alert(e.message))
      .finally(() => { setUpdatingBook(null); clearImportStages() })
  }

  const saveAnnotation = (text: string, note: string) => {
    if (view.kind !== 'reader') return
    fetch('/api/annotate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: view.book.id, chapter_num: view.cnum, original_text: text, annotation: note })
    }).then(() => openChapter(view.book, view.cnum, view.total))
  }

  const sendChat = () => {
    if (!chatInput.trim() || ccBusy || view.kind !== 'reader') return
    const msg = chatInput.trim()
    setChatInput('')
    const ctx = selection
      ? `（共读《${view.book.title}》第${view.cnum}章${chapter?.title ? `「${chapter.title}」` : ''}，选了这段：「${selection.length > 120 ? selection.slice(0, 120) + '…' : selection}」）\n\n${msg}`
      : `（共读《${view.book.title}》第${view.cnum}章${chapter?.title ? `「${chapter.title}」` : ''}）\n\n${msg}`
    store.sendMessage(ctx)
    setSelection('')
  }

  const handleSelection = () => {
    const s = window.getSelection()
    if (!s || s.isCollapsed) return
    const t = s.toString().trim()
    if (t.length >= 2) setSelection(t)
  }

  const renderContent = (content: string, annotations: Ann[]) => {
    const marks = annotations
      .filter(a => a.original_text && content.includes(a.original_text))
      .map(a => ({ ...a, start: content.indexOf(a.original_text), end: content.indexOf(a.original_text) + a.original_text.length }))
      .sort((a, b) => a.start - b.start)
    const segs: { text: string; ann: Ann | null }[] = []
    let pos = 0
    for (const m of marks) {
      if (m.start < pos) continue
      if (m.start > pos) segs.push({ text: content.slice(pos, m.start), ann: null })
      segs.push({ text: content.slice(m.start, m.end), ann: m })
      pos = m.end
    }
    if (pos < content.length) segs.push({ text: content.slice(pos), ann: null })
    if (!segs.length) segs.push({ text: content, ann: null })
    return segs.map((s, i) => s.ann
      ? <span key={i} className={`rd-hl rd-hl-${s.ann.annotator}`} onClick={e => { e.stopPropagation(); setAnnPopup({ ann: s.ann!, x: e.clientX, y: e.clientY }) }}>{s.text}</span>
      : <span key={i}>{s.text}</span>
    )
  }

  const header = (title: string, back: () => void, right?: React.ReactNode) => (
    <div className="rd-header">
      <button onClick={back} className="rd-back">‹</button>
      <span className="rd-title">{title}</span>
      <span style={{ marginLeft: 'auto' }}>{right}</span>
    </div>
  )

  // ── DISCOVER ──
  if (view.kind === 'discover') return (
    <div className="rd-page">
      {header('找书', () => { fetchBooks(); setView({ kind: 'shelf' }) })}
      <div className="rd-body">
        <div className="rd-disc-tabs">
          <span className={`rd-disc-tab${discoverTab === 'ao3' ? ' active' : ''}`} onClick={() => setDiscoverTab('ao3')}>AO3</span>
          <span className={`rd-disc-tab${discoverTab === 'link' ? ' active' : ''}`} onClick={() => setDiscoverTab('link')}>链接导入</span>
        </div>

        {discoverTab === 'ao3' && <>
          <div className="rd-search-bar">
            <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
              placeholder="搜关键词、tag、作者…" />
            <button onClick={doSearch} disabled={searching}>{searching ? '…' : '搜'}</button>
          </div>
          {searchError && <p className="rd-disc-err">{searchError}</p>}
          {searchResults.length === 0 && !searching && !searchError && searchQ && <p className="rd-disc-empty">没有结果</p>}
          <div className="rd-results">
            {searchResults.map(r => (
              <div key={r.id} className={`rd-result${expandedResult === r.id ? ' expanded' : ''}`}>
                <div className="rd-result-head" onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)}>
                  <div className="rd-result-title">{r.title}</div>
                  <div className="rd-result-meta">
                    <span>{r.author}</span>
                    {r.words && <span>{r.words} 字</span>}
                    {r.kudos !== '0' && <span>♥ {r.kudos}</span>}
                    {r.chapters && <span>{r.chapters} 章</span>}
                  </div>
                  {r.fandoms.length > 0 && <div className="rd-result-fandom">{r.fandoms.slice(0, 3).join(' · ')}</div>}
                </div>
                {expandedResult === r.id && (
                  <div className="rd-result-detail">
                    {r.summary && <p className="rd-result-summary">{r.summary}</p>}
                    {r.language && <p className="rd-result-lang">{r.language}</p>}
                    <button className="rd-import-btn" onClick={() => importAO3(r.id)} disabled={importingId === r.id}>
                      {importingId === r.id ? importStage || '导入中…' : '导入到书架'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>}

        {discoverTab === 'link' && <>
          <p className="rd-disc-hint">从鸠摩搜书、Anna's Archive 等找到 epub 直链，粘贴在这里。</p>
          <div className="rd-link-bar">
            <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') importFromUrl() }}
              placeholder="https://…/book.epub" />
            <button onClick={importFromUrl} disabled={importingLink}>{importingLink ? importStage || '导入中…' : '导入'}</button>
          </div>
        </>}
      </div>
    </div>
  )

  // ── SHELF ──
  if (view.kind === 'shelf') return (
    <div className="rd-page">
      {header('共读', () => onBack('home'))}
      <div className="rd-body">
        <p className="rd-sub">falling in love on the same page</p>
        {books.length === 0 && <p className="rd-empty">书架还是空的。</p>}
        {books.map(b => (
          <div key={b.id} className="rd-row" onClick={() => openBook(b)}>
            <div style={{ position: 'relative', width: 42, height: 56, flex: '0 0 42px', borderRadius: 5, overflow: 'hidden', display: 'grid', placeItems: 'center', color: 'white', background: coverColor(b.title), fontSize: 18 }}>
              <span>{b.title.trim().charAt(0) || '书'}</span>
              {b.cover && <img src={b.cover} alt="" loading="lazy" decoding="async" onError={e => { e.currentTarget.style.display = 'none' }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div className="rd-row-info">
              <span>{b.title}</span>
              <small>{b.author}{b.author && ' · '}{b.chapter_count}章{b.last_chapter ? ` · 读到第${b.last_chapter}章` : ''}</small>
            </div>
            <button className="rd-del-btn" onClick={e => deleteBook(e, b)} title="删除">✕</button>
          </div>
        ))}
        <div className="rd-shelf-actions">
          <button className="rd-find-btn" onClick={() => setView({ kind: 'discover' })}>找书</button>
          <label className="rd-upload-btn">
            {uploading ? importStage || '导入中…' : '导入 EPUB / TXT'}
            <input type="file" accept=".epub,.txt" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; e.currentTarget.value = ''; if (file) uploadBookFile(file) }} />
          </label>
        </div>
      </div>
    </div>
  )

  // ── TOC ──
  if (view.kind === 'toc') return (
    <div className="rd-page">
      {header(view.book.title, () => { fetchBooks(); setView({ kind: 'shelf' }) }, view.book.source_url
        ? <button className="rd-chat-btn" onClick={() => updateFromAO3(view.book)} disabled={updatingBook === view.book.id}>{updatingBook === view.book.id ? importStage || '检查中…' : '检查更新'}</button>
        : undefined)}
      <div className="rd-body">
        {view.book.author && <p className="rd-sub">{view.book.author}</p>}
        {view.chapters.map(c => (
          <div key={c.chapter_num} className="rd-row" onClick={() => openChapter(view.book, c.chapter_num, view.chapters.length)}>
            <span>#{c.chapter_num} {c.title}</span>
            {c.chapter_num === view.book.last_chapter && <small>上次读到</small>}
          </div>
        ))}
      </div>
    </div>
  )

  // ── READER ──
  return (
    <div className="rd-page" onClick={() => setAnnPopup(null)}>
      {header(chapter?.title || `第${view.cnum}章`, () => openBook(view.book),
        <button className="rd-chat-btn" onClick={() => setChatOpen(!chatOpen)}>💬</button>
      )}
      {showAnnotationHint && (
        <button type="button" aria-live="polite" onClick={dismissAnnotationHint} style={{ position: 'fixed', zIndex: 220, top: 'calc(env(safe-area-inset-top, 0px) + 56px)', left: '50%', transform: 'translateX(-50%)', width: 'max-content', maxWidth: 'calc(100vw - 32px)', padding: '9px 14px', border: '1px solid var(--border, rgba(0,0,0,.08))', borderRadius: 999, background: 'var(--bg, #fff)', color: 'var(--text, #332f2b)', boxShadow: '0 6px 20px rgba(0,0,0,.12)', font: 'inherit', fontSize: 13, cursor: 'pointer' }}>
          长按选中文字，可以批注或共读
        </button>
      )}
      <div className="rd-body rd-reader-body" onMouseUp={handleSelection} onTouchEnd={() => setTimeout(handleSelection, 300)}>
        <p className="rd-sub">{view.book.title} · #{view.cnum}</p>
        <div className="rd-content">{chapter ? renderContent(chapter.content, anns) : '加载中…'}</div>
        <div className="rd-nav">
          {view.cnum > 1 ? <span className="rd-navlink" onClick={() => openChapter(view.book, view.cnum - 1, view.total)}>← 上一章</span> : <span />}
          {view.cnum < view.total ? <span className="rd-navlink" onClick={() => openChapter(view.book, view.cnum + 1, view.total)}>下一章 →</span> : <span />}
        </div>
      </div>

      {selection && !chatOpen && (
        <div className="rd-selbar">
          <div className="rd-sel-quote">「{selection.length > 30 ? selection.slice(0, 30) + '…' : selection}」</div>
          <div className="rd-sel-actions">
            <button onClick={() => setChatOpen(true)}>聊这句</button>
            <button onClick={() => {
              const note = prompt('写一条批注：')
              if (note) saveAnnotation(selection, note)
              setSelection('')
            }}>批注</button>
            <button onClick={() => setSelection('')}>取消</button>
          </div>
        </div>
      )}

      {annPopup && (
        <div className="rd-ann-popup" style={{ left: Math.min(annPopup.x, window.innerWidth - 220), top: annPopup.y + 10 }} onClick={e => e.stopPropagation()}>
          <div className="rd-ann-who">{annPopup.ann.annotator === 'user' ? '读者' : '苏煦'}</div>
          <div className="rd-ann-text">{annPopup.ann.annotation}</div>
          <div className="rd-ann-acts">
            <span onClick={() => { setSelection(annPopup.ann.original_text); setChatOpen(true); setAnnPopup(null) }}>聊这条</span>
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="rd-chat-sheet">
          <div className="rd-chat-hd">
            <div className="rd-chat-tabs">
              <span className={`rd-chat-tab${chatChannel === 'cc' ? ' active' : ''}`} onClick={() => switchChannel('cc')}>CC</span>
              <span className={`rd-chat-tab${chatChannel === 'api' ? ' active' : ''}`} onClick={() => switchChannel('api')}>API</span>
            </div>
            <span className="rd-chat-q">{selection ? `「${selection.length > 30 ? selection.slice(0, 30) + '…' : selection}」` : ''}</span>
            <span className="rd-chat-x" onClick={() => setChatOpen(false)}>✕</span>
          </div>
          <div className="rd-chat-log" ref={logRef}>
            {!connected || !authed ? (
              <div className="rd-chat-msg rd-chat-ai" style={{ opacity: 0.6 }}>连接中…</div>
            ) : recentMsgs.length === 0 ? (
              <div className="rd-chat-msg rd-chat-ai" style={{ opacity: 0.6 }}>选一段文字，聊聊这本书。</div>
            ) : recentMsgs.map((m: ChatMessage, i: number) => (
              <div key={m.id || i} className={`rd-chat-msg rd-chat-${m.role === 'user' ? 'me' : 'ai'}${m.pending ? ' pending' : ''}`}>
                {m.role === 'assistant' && m.thinking && (
                  <details className="rd-chat-thinking" open={m.pending || undefined}>
                    <summary>思考</summary>
                    <div>{m.thinking}</div>
                  </details>
                )}
                {typeof m.content === 'string' ? m.content : ''}
              </div>
            ))}
          </div>
          <div className="rd-chat-input">
            <textarea rows={1} value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
              placeholder="聊聊这本书…" />
            <button className="rd-chat-send" onClick={sendChat} disabled={ccBusy}>↑</button>
          </div>
        </div>
      )}
    </div>
  )
}
