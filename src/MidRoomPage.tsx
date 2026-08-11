import { useState, useEffect, useRef, useCallback } from 'react'
import type { Page } from './App'

type Who = 'yanchen' | 'chatgpt' | 'xuxu' | 'yuanyao'
interface Message { id: number; who: Who; message: string; ts: number; topic: string }
interface TopicInfo { topic: string; count: number; latest_id: number; latest_ts: number; latest_who: Who; latest_preview: string }
interface SummaryBlock { text: string; covers_up_to: number; covered_msg_count: number; updated_ts: number }

const API = '/midroom'
const DEFAULT_TOPIC = 'main'
const SETTINGS_KEY = 'sea:midroom:settings'
const WHO_LABEL: Record<string, string> = { yanchen: '晏岑', chatgpt: '晏岑', xuxu: '苏煦', yuanyao: '原瑶' }
const WHO_CLASS: Record<string, string> = { yanchen: 'yanchen', chatgpt: 'yanchen', xuxu: 'xuxu', yuanyao: 'yuanyao' }

interface Settings { defaultLimit: number }
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) { const s = JSON.parse(raw); if (typeof s?.defaultLimit === 'number') return s }
  } catch {}
  return { defaultLimit: 30 }
}
function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  const m = d.getMonth() + 1, day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0'), min = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${h}:${min}`
}

export function MidRoomPage({ onBack }: { onBack: (p: Page) => void }) {
  const [topic, setTopic] = useState<string>(DEFAULT_TOPIC)
  const [topics, setTopics] = useState<TopicInfo[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [topicCount, setTopicCount] = useState<number>(0)
  const [summary, setSummary] = useState<SummaryBlock | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [otherActivity, setOtherActivity] = useState<Record<string, number>>({})
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [limitDraft, setLimitDraft] = useState(String(settings.defaultLimit))
  useEffect(() => { setLimitDraft(String(settings.defaultLimit)) }, [settings.defaultLimit])
  const logRef = useRef<HTMLDivElement>(null)
  const seenIds = useRef(new Set<number>())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const topicRef = useRef(topic)
  topicRef.current = topic

  const scrollBottom = useCallback(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const loadTopics = useCallback(async () => {
    try {
      const r = await fetch(`${API}/topics`, { credentials: 'include' })
      if (!r.ok) return
      const data = await r.json()
      setTopics(data.topics || [])
    } catch {}
  }, [])

  const applyRead = useCallback((data: any) => {
    const msgs = (data.messages || []) as Message[]
    seenIds.current = new Set(msgs.map(m => m.id))
    setMessages(msgs)
    setTopicCount(data.topic_count || 0)
    setSummary(data.summary || null)
  }, [])

  const loadMessages = useCallback(async (t: string, limit?: number) => {
    const lim = limit ?? settings.defaultLimit
    try {
      const r = await fetch(`${API}/read?topic=${encodeURIComponent(t)}&limit=${lim}&who=yuanyao`, { credentials: 'include' })
      if (!r.ok) throw new Error(String(r.status))
      const data = await r.json()
      applyRead(data)
      setOtherActivity(prev => ({ ...prev, [t]: 0 }))
      setTimeout(scrollBottom, 0)
    } catch (e) {
      console.warn('[midroom] load', e)
    }
  }, [scrollBottom, settings.defaultLimit, applyRead])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    const preserve = logRef.current?.scrollHeight ?? 0
    try {
      const nextLimit = messages.length + settings.defaultLimit
      const r = await fetch(`${API}/read?topic=${encodeURIComponent(topic)}&limit=${nextLimit}&who=yuanyao`, { credentials: 'include' })
      if (!r.ok) throw new Error(String(r.status))
      const data = await r.json()
      applyRead(data)
      // 保持滚动位置（不跳到底）
      setTimeout(() => {
        const el = logRef.current
        if (el) el.scrollTop = el.scrollHeight - preserve
      }, 0)
    } catch (e) {
      console.warn('[midroom] loadMore', e)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, messages.length, settings.defaultLimit, topic, applyRead])

  const markRead = useCallback((t: string, id: number) => {
    if (id <= 0) return
    fetch(`${API}/mark-read`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ who: 'yuanyao', topic: t, id }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    let es: EventSource | null = null
    let retryTimer: number | null = null

    const connect = async () => {
      await loadTopics()
      await loadMessages(topicRef.current)
      if (!alive) return
      es = new EventSource(`${API}/events`, { withCredentials: true })
      es.onopen = () => alive && setConnected(true)
      es.onerror = () => {
        if (!alive) return
        setConnected(false)
        es?.close()
        retryTimer = window.setTimeout(connect, 3000)
      }
      es.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data) as Message
          const curT = topicRef.current
          if (m.topic === curT) {
            if (seenIds.current.has(m.id)) return
            seenIds.current.add(m.id)
            setMessages(prev => [...prev, m])
            setTopicCount(c => c + 1)
            setTimeout(scrollBottom, 0)
            markRead(curT, m.id)
          } else {
            setOtherActivity(prev => ({ ...prev, [m.topic]: (prev[m.topic] || 0) + 1 }))
          }
          loadTopics()
        } catch {}
      }
    }
    connect()
    return () => {
      alive = false
      if (retryTimer) clearTimeout(retryTimer)
      es?.close()
    }
  }, [loadTopics, loadMessages, scrollBottom, markRead])

  useEffect(() => { loadMessages(topic) }, [topic, loadMessages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const r = await fetch(`${API}/speak`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: 'yuanyao', message: text, topic }),
      })
      if (r.ok) { setInput(''); inputRef.current?.focus() }
      else console.warn('[midroom] speak', r.status)
    } catch (e) { console.warn(e) }
    finally { setSending(false) }
  }, [input, sending, topic])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
  }

  const newTopic = () => {
    const name = window.prompt('新话题名字（40 字以内）', '')?.trim()
    if (!name) return
    if (name.length > 40) { alert('名字太长'); return }
    setTopic(name)
    setOtherActivity(prev => ({ ...prev, [name]: 0 }))
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next); saveSettings(next)
  }

  const topicOptions = (() => {
    const set = new Map<string, TopicInfo>()
    for (const t of topics) set.set(t.topic, t)
    if (!set.has(topic)) set.set(topic, { topic, count: 0, latest_id: 0, latest_ts: Date.now(), latest_who: 'yuanyao', latest_preview: '(new)' })
    if (!set.has(DEFAULT_TOPIC)) set.set(DEFAULT_TOPIC, { topic: DEFAULT_TOPIC, count: 0, latest_id: 0, latest_ts: 0, latest_who: 'yuanyao', latest_preview: '' })
    return Array.from(set.values()).sort((a, b) => b.latest_ts - a.latest_ts)
  })()

  const canLoadMore = topicCount > messages.length
  const olderRemaining = Math.max(0, topicCount - messages.length)

  return (
    <div className="mr-page">
      <header className="mr-header">
        <button className="mr-back" onClick={() => onBack('home')} aria-label="返回">←</button>
        <span className="mr-title">合相间</span>
        <span className={`mr-dot ${connected ? 'on' : 'off'}`} title={connected ? '实时' : '断开'}>●</span>
        <button className="mr-gear" onClick={() => setSettingsOpen(o => !o)} aria-label="设置" title="设置">⚙</button>
      </header>
      {settingsOpen && (
        <div className="mr-settings">
          <div className="mr-set-row">
            <label>每次拉取消息数</label>
            <input
              type="number" min={1} max={200}
              value={limitDraft}
              onChange={e => setLimitDraft(e.target.value)}
              onBlur={() => {
                const n = Math.floor(Number(limitDraft))
                if (Number.isFinite(n) && n >= 1) {
                  const c = Math.min(200, Math.max(1, n))
                  if (c !== settings.defaultLimit) updateSettings({ defaultLimit: c })
                  setLimitDraft(String(c))
                } else {
                  setLimitDraft(String(settings.defaultLimit))
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
            <span className="mr-set-hint">进入 / 加载更多 时用</span>
          </div>
          <div className="mr-set-note">
            AI 侧（苏煦/晏岑）走 midroom_read 工具，他们的默认拉取由后端工具描述定（3 条 + since 增量），改那个会破缓存。
          </div>
        </div>
      )}
      <div className="mr-topicbar">
        <select className="mr-topic-sel" value={topic} onChange={e => setTopic(e.target.value)}>
          {topicOptions.map(t => {
            const badge = otherActivity[t.topic] ? ` ●${otherActivity[t.topic]}` : ''
            return <option key={t.topic} value={t.topic}>{t.topic}{t.count ? ` (${t.count})` : ''}{badge}</option>
          })}
        </select>
        <button className="mr-topic-new" onClick={newTopic} title="新话题">＋</button>
      </div>
      <div className="mr-hint">话题：<b>{topic}</b> · 共 {topicCount} 条 · 显示 {messages.length}</div>
      <div className="mr-log" ref={logRef}>
        {summary && (
          <div className={`mr-summary ${summaryOpen ? 'open' : ''}`}>
            <button className="mr-summary-head" onClick={() => setSummaryOpen(o => !o)}>
              <span className="mr-summary-icon">📜</span>
              <span className="mr-summary-title">
                历史摘要 · 覆盖前 {summary.covered_msg_count} 条（id 1~{summary.covers_up_to}）
              </span>
              <span className="mr-summary-time">{formatTs(summary.updated_ts)}</span>
              <span className="mr-summary-caret">{summaryOpen ? '▾' : '▸'}</span>
            </button>
            {summaryOpen && <div className="mr-summary-body">{summary.text}</div>}
          </div>
        )}
        {canLoadMore && (
          <button className="mr-loadmore" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? '加载中…' : `↑ 加载更早 ${Math.min(olderRemaining, settings.defaultLimit)} 条（还有 ${olderRemaining} 条更早的）`}
          </button>
        )}
        {messages.length === 0 && !summary && <div className="mr-empty">此话题下还没消息</div>}
        {messages.map(m => (
          <div key={m.id} className={`mr-msg mr-${WHO_CLASS[m.who] || m.who}`}>
            <div className="mr-who">{WHO_LABEL[m.who] || m.who}</div>
            <div className="mr-body">{m.message}</div>
          </div>
        ))}
      </div>
      <div className="mr-input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`发到「${topic}」…（Ctrl/⌘+Enter 发送）`}
          rows={2}
          maxLength={8000}
        />
        <button className="mr-send" onClick={send} disabled={!input.trim() || sending}>
          {sending ? '…' : '发送'}
        </button>
      </div>
    </div>
  )
}
