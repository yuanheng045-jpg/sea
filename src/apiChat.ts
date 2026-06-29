// API 门聊天 client:走 Atlantis memory-service /chat/completions(SSE)
// 实现与 chatStore 兼容的接口,让 CCPage 能 channel='api' 无缝切到它
import { useSyncExternalStore } from 'react'
import type { ChatMessage } from './chatStore'

type ApiState = {
  messages: ChatMessage[]
  streaming: boolean
  convId: string | null
  providerId: string | null
  model: string
  models: string[]
  ready: boolean
  error: string | null
}
let _s: ApiState = {
  messages: [], streaming: false, convId: null,
  providerId: null, model: 'anthropic/claude-opus-4.6', models: [],
  ready: false, error: null,
}
const subs = new Set<() => void>()
function emit() { subs.forEach((f) => f()) }
function set(p: Partial<ApiState>) { _s = { ..._s, ...p }; emit() }

// 用户偏好(文字色)与 CC 共用 localStorage
const COLOR_KEY = 'sea-text-colors'
function loadColors(): { su: string; you: string } {
  try { const r = localStorage.getItem(COLOR_KEY); if (r) return JSON.parse(r) } catch {}
  return { su: '#5b7099', you: '#857354' }
}

let _initing = false
export async function initApi() {
  if (_s.ready || _initing) return
  _initing = true
  try {
    const provs = await fetch('/api/providers', { credentials: 'include' }).then((r) => r.json())
    const list = Array.isArray(provs) ? provs : (provs?.providers || [])
    const or = list.find((p: any) => Array.isArray(p.models) && p.models.some((m: string) => /anthropic\/claude/i.test(m)))
      || list.find((p: any) => /open\s*router/i.test(p.name || ''))
      || list.find((p: any) => p.type === 'openai')
      || list[0]
    const models: string[] = Array.isArray(or?.models) ? or.models : []
    let model = _s.model
    if (models.length && !models.includes(model)) model = models.find((m) => /opus/i.test(m)) || models[0]
    let convId: string | null = null
    try {
      const convs = await fetch('/api/conversations', { credentials: 'include' }).then((r) => r.json())
      const cl = Array.isArray(convs) ? convs : (convs?.conversations || [])
      convId = cl[0]?.id ?? null
    } catch {}
    if (!convId) {
      try {
        const c = await fetch('/api/conversations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }).then((r) => r.json())
        convId = c?.id ?? null
      } catch {}
    }
    let msgs: ChatMessage[] = []
    if (convId) {
      try {
        const d = await fetch('/api/conversations/' + convId, { credentials: 'include' }).then((r) => r.json())
        const hist = d?.messages || []
        msgs = hist.map((m: any, i: number): ChatMessage => ({ id: 'h' + i, role: m.role === 'user' ? 'user' : 'assistant', content: m.content || '', thinking: m.thinking || undefined, ts: 0 }))
      } catch {}
    }
    set({ providerId: or?.id ?? null, model, models, convId, messages: msgs, ready: true })
  } catch (e: any) {
    set({ error: String(e?.message || e), ready: true })
  } finally { _initing = false }
}

function updateAi(id: string, content: string, thinking: string, hits: any[] | undefined, pending = true) {
  _s = { ..._s, messages: _s.messages.map((m) => m.id === id ? { ...m, content, thinking: thinking || undefined, memoryHits: hits, pending } : m) }
  emit()
}

// === chatStore 兼容接口 ===
export function sendMessage(text: string, _extra?: any) {
  if (_s.streaming || !text.trim()) return
  const userMsg: ChatMessage = { id: 'u' + Date.now(), role: 'user', content: text, ts: Date.now() }
  const aiId = 'a' + Date.now()
  const aiMsg: ChatMessage = { id: aiId, role: 'assistant', content: '', pending: true, ts: Date.now() }
  const history = [..._s.messages, userMsg].map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
  set({ messages: [..._s.messages, userMsg, aiMsg], streaming: true })
  ;(async () => {
    try {
      const res = await fetch('/api/chat/completions', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, model: _s.model, provider_id: _s.providerId, conversation_id: _s.convId, temperature: 0.7 }),
      })
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = '', content = '', thinking = ''
      let hits: any[] | undefined
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          let p: any
          try { p = JSON.parse(data) } catch { continue }
          if (p.error) { content += '\n[错误] ' + p.error; continue }
          if (p.type === 'memory_hits') hits = p.hits
          const delta = p.choices?.[0]?.delta
          if (delta?.thinking) thinking += delta.thinking
          if (delta?.content) content += delta.content
          updateAi(aiId, content, thinking, hits)
        }
      }
      updateAi(aiId, content, thinking, hits, false)
    } catch (e: any) {
      updateAi(aiId, '[连接失败] ' + (e?.message || e), '', undefined, false)
    } finally { set({ streaming: false }) }
  })()
}

export async function switchConversation(id: string) {
  if (_s.convId === id) return
  set({ convId: id, ready: false })
  try {
    const d = await fetch('/api/conversations/' + id, { credentials: 'include' }).then((r) => r.json())
    const hist = d?.messages || []
    const msgs: ChatMessage[] = hist.map((m: any, i: number) => ({ id: 'h' + i, role: m.role === 'user' ? 'user' : 'assistant', content: m.content || '', thinking: m.thinking || undefined, ts: 0 }))
    set({ convId: id, messages: msgs, ready: true })
  } catch { set({ ready: true }) }
}

export function sendSessionAction(action: string, payload?: any) {
  if (action === 'session_set_model' && payload?.model) set({ model: payload.model })
}
// hub-print 特有,API 门无对应 → 空实现(不崩)
export function sendRaw(_msg: any) {}
export function setHintsEnabled(_v: boolean) {}
export function setHealthEnabled(_v: boolean) {}
export function sendClaudemdGet() {}
export function sendClaudemdSave(_c: string) {}
export function loadMoreMessages() {}
export function clearAutoExpanded(_id: string) {}

export function useChatState() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f) } },
    () => _viewCache(),
    () => _viewCache(),
  )
}
let _viewRef: any = null
let _viewKey = ''
function _viewCache() {
  const key = _s.messages.length + '|' + _s.streaming + '|' + _s.model + '|' + _s.ready + '|' + (_s.messages[_s.messages.length - 1]?.content?.length || 0)
  if (key === _viewKey && _viewRef) return _viewRef
  _viewKey = key
  _viewRef = {
    messages: _s.messages,
    visibleCount: _s.messages.length,
    connected: true,
    authed: true,
    ccAlive: _s.ready,
    ccBusy: _s.streaming,
    streamingPhase: _s.streaming ? 'typing' : null,
    streamingElapsed: null,
    sessionState: { model: _s.model, models: _s.models, convId: _s.convId },
    actionPending: null,
    hintsEnabled: false,
    healthEnabled: false,
    textColors: loadColors(),
    claudemd: { content: null, lastSave: null },
  }
  return _viewRef
}
