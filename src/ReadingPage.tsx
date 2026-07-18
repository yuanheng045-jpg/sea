import { useState, useEffect, useRef, useCallback } from 'react'
import type { Page } from './App'
import * as ccStore from './chatStore'
import * as apiStore from './apiChat'
import type { ChatMessage } from './chatStore'

type Book = { id: string; title: string; author: string; last_chapter: number; chapter_count: number; last_read_at: string }
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

export function ReadingPage({ onBack }: { onBack: (p: Page) => void }) {
  const [view, setView] = useState<View>({ kind: 'shelf' })
  const [books, setBooks] = useState<Book[]>([])
  const [chapter, setChapter] = useState<{ title: string; content: string } | null>(null)
  const [anns, setAnns] = useState<Ann[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [selection, setSelection] = useState('')
  const [uploading, setUploading] = useState(false)
  const [annPopup, setAnnPopup] = useState<{ ann: Ann; x: number; y: number } | null>(null)
  const [chatChannel, setChatChannel] = useState<'cc' | 'api'>(() => {
    try { return (localStorage.getItem(CH_KEY) as 'cc' | 'api') || 'cc' } catch { return 'cc' }
  })
  const logRef = useRef<HTMLDivElement>(null)

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

  const openChapter = (book: Book, cnum: number, total: number) => {
    fetch(`${API}/books/${book.id}/chapters/${cnum}`).then(r => r.json()).then(d => {
      setChapter(d.chapter)
      setAnns(d.annotations || [])
      setView({ kind: 'reader', book, cnum, total: d.totalChapters || total })
      setChatOpen(false)
      setSelection('')
    })
  }

  const deleteBook = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation()
    if (!confirm(`删掉《${book.title}》？批注和聊天记录也会一起删除。`)) return
    fetch(`${API}/books/${book.id}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(() => fetchBooks())
  }

  const uploadEpub = (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('epub', file)
    fetch('/api/import-epub', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(d => {
        setUploading(false)
        if (d.success) { fetchBooks(); openBook({ id: d.book_id, title: '', author: '', last_chapter: 0, chapter_count: d.chapters, last_read_at: '' }) }
        else alert(d.error || '导入失败')
      })
      .catch(() => { setUploading(false); alert('导入失败') })
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
    fetch(`${API}/import-ao3`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_id: workId })
    })
      .then(r => r.json())
      .then(d => {
        setImportingId(null)
        if (d.success) {
          fetchBooks()
          alert(`《${d.title}》已导入，共 ${d.chapters} 章`)
          setView({ kind: 'shelf' })
        } else {
          alert(d.error || '导入失败')
        }
      })
      .catch(() => { setImportingId(null); alert('导入失败') })
  }

  const importFromUrl = () => {
    if (!linkUrl.trim() || importingLink) return
    setImportingLink(true)
    fetch(`${API}/import-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: linkUrl.trim() })
    })
      .then(r => r.json())
      .then(d => {
        setImportingLink(false)
        if (d.success) {
          fetchBooks()
          setLinkUrl('')
          alert(`《${d.title}》已导入，共 ${d.chapters} 章`)
          setView({ kind: 'shelf' })
        } else {
          alert(d.error || '导入失败')
        }
      })
      .catch(() => { setImportingLink(false); alert('导入失败') })
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
                      {importingId === r.id ? '导入中…' : '导入到书架'}
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
            <button onClick={importFromUrl} disabled={importingLink}>{importingLink ? '导入中…' : '导入'}</button>
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
            {uploading ? '导入中…' : '导入 epub'}
            <input type="file" accept=".epub" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && uploadEpub(e.target.files[0])} />
          </label>
        </div>
      </div>
    </div>
  )

  // ── TOC ──
  if (view.kind === 'toc') return (
    <div className="rd-page">
      {header(view.book.title, () => { fetchBooks(); setView({ kind: 'shelf' }) })}
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
