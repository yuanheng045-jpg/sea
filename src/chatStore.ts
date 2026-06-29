// Observable 状态层：chatClient 事件 → React 可订阅 state
// 给 sea 各组件一个统一的 chat 状态 + sendMessage 入口
import { useSyncExternalStore } from 'react'
import { createChatClient, type HubEvent, type ChatClient } from './chatClient'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'activity'
  content?: any
  activities?: any[]
  ts: number
  thinking?: string
  image?: any
  file?: any
  images?: string[]
  files?: Array<{ url: string; name?: string }>
  htmls?: string[]
  pending?: boolean
  autoExpanded?: boolean
  memoryHits?: any[]
  fresh?: boolean
}

type State = {
  messages: ChatMessage[]
  visibleCount: number
  ccAlive: boolean
  ccBusy: boolean
  streamingPhase: string | null
  streamingElapsed: number | null
  connected: boolean
  authed: boolean
  sessionState: Record<string, any> | null
  actionPending: 'forge' | 'compact' | null
  hintsEnabled: boolean
  healthEnabled: boolean
  textColors: { su: string; you: string }
  claudemd: { content: string | null; lastSave: 'ok' | 'fail' | null }
}

const HINTS_KEY = 'sea-hints-enabled'
function loadHints(): boolean {
  try {
    const raw = localStorage.getItem(HINTS_KEY)
    if (raw === null) return true
    return raw === 'true'
  } catch { return true }
}

const HEALTH_KEY = 'sea-health-enabled'
function loadHealth(): boolean {
  try {
    const raw = localStorage.getItem(HEALTH_KEY)
    if (raw === null) return true
    return raw === 'true'
  } catch { return true }
}

const COLOR_KEY = 'sea-text-colors'
type TextColors = { su: string; you: string }
const DEFAULT_TEXT_COLORS: TextColors = { su: '#5b7099', you: '#857354' }
function loadTextColors(): TextColors {
  try {
    const raw = localStorage.getItem(COLOR_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_TEXT_COLORS, ...parsed }
    }
  } catch {}
  return DEFAULT_TEXT_COLORS
}
function applyTextColors(c: TextColors) {
  document.documentElement.style.setProperty('--text-su', c.su)
  document.documentElement.style.setProperty('--text-you', c.you)
}
applyTextColors(loadTextColors())

let state: State = {
  messages: [],
  visibleCount: 50,
  ccAlive: false,
  ccBusy: false,
  streamingPhase: null,
  streamingElapsed: null,
  connected: false,
  authed: false,
  sessionState: null,
  actionPending: null,
  hintsEnabled: loadHints(),
  healthEnabled: loadHealth(),
  textColors: loadTextColors(),
  claudemd: { content: null, lastSave: null },
}

const listeners = new Set<() => void>()
let _client: ChatClient | null = null

function setState(updater: (s: State) => State) {
  state = updater(state)
  listeners.forEach((l) => l())
}

function handleEvent(e: HubEvent) {
  switch (e.type) {
    case 'open':
      setState((s) => ({ ...s, connected: true }))
      break
    case 'close':
      setState((s) => ({ ...s, connected: false, authed: false }))
      break
    case 'auth_ok':
      setState((s) => ({ ...s, authed: true, ccAlive: !!(e as any).cc_alive }))
      break
    case 'auth_fail':
      setState((s) => ({ ...s, authed: false }))
      break
    case 'history': {
      const msgs = ((e as any).messages ?? []) as ChatMessage[]
      setState((s) => ({ ...s, messages: msgs, visibleCount: 50 }))
      break
    }
    case 'message': {
      const m = e as any as ChatMessage
      setState((s) => {
        if (s.messages.some((x) => x.id === m.id)) return s
        return { ...s, messages: [...s.messages, { ...m, fresh: true }] }
      })
      break
    }
    case 'thinking': {
      const t = e as any
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === t.message_id ? { ...m, thinking: t.thinking } : m
        ),
      }))
      break
    }
    case 'thinking_start':
    case 'text_start': {
      const t = e as any
      const streamId = `stream-${t.reply_to ?? Date.now()}`
      setState((s) => {
        if (s.messages.some((m) => m.id === streamId)) return s
        return {
          ...s,
          messages: [...s.messages, {
            id: streamId,
            role: 'assistant',
            content: '',
            thinking: '',
            ts: Date.now(),
            pending: true,
            autoExpanded: true,
          }],
        }
      })
      break
    }
    case 'thinking_delta': {
      const t = e as any
      setState((s) => {
        const msgs = [...s.messages]
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant' && msgs[i].pending) {
            msgs[i] = { ...msgs[i], thinking: (msgs[i].thinking ?? '') + (t.text ?? '') }
            break
          }
        }
        return { ...s, messages: msgs }
      })
      break
    }
    case 'text_delta': {
      const t = e as any
      setState((s) => {
        const msgs = [...s.messages]
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant' && msgs[i].pending) {
            const prev = typeof msgs[i].content === 'string' ? (msgs[i].content as string) : ''
            msgs[i] = { ...msgs[i], content: prev + (t.text ?? '') }
            break
          }
        }
        return { ...s, messages: msgs }
      })
      break
    }
    case 'done': {
      const d = e as any
      setState((s) => {
        const msgs = [...s.messages]
        let replaced = false
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant' && msgs[i].pending && msgs[i].id.startsWith('stream-')) {
            msgs[i] = {
              id: d.id,
              role: 'assistant',
              content: d.content ?? '',
              thinking: d.thinking ?? undefined,
              ts: typeof d.ts === 'string' ? new Date(d.ts).getTime() : (d.ts ?? Date.now()),
              pending: false,
              autoExpanded: true,
              images: d.images, files: d.files, htmls: d.htmls,
            }
            replaced = true
            break
          }
        }
        if (!replaced && !msgs.some((m) => m.id === d.id)) {
          msgs.push({
            id: d.id,
            role: 'assistant',
            content: d.content ?? '',
            thinking: d.thinking ?? undefined,
            ts: typeof d.ts === 'string' ? new Date(d.ts).getTime() : (d.ts ?? Date.now()),
            images: d.images, files: d.files, htmls: d.htmls,
          })
        }
        return { ...s, messages: msgs }
      })
      break
    }
    case 'edit': {
      const ed = e as any
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === ed.id ? { ...m, content: ed.content } : m
        ),
      }))
      break
    }
    case 'cc_status':
      setState((s) => ({ ...s, ccAlive: !!(e as any).alive }))
      break
    case 'cc_busy':
      setState((s) => ({ ...s, ccBusy: !!(e as any).busy }))
      break
    case 'streaming_status':
      setState((s) => ({
        ...s,
        streamingPhase: (e as any).phase ?? null,
        streamingElapsed: (e as any).elapsed ?? null,
      }))
      break
    case 'session_state': {
      setState((s) => ({ ...s, sessionState: e as any }))
      break
    }
    case 'session_action_result': {
      setState((s) => ({ ...s, actionPending: null }))
      break
    }
    case 'claudemd': {
      const content = (e as any).content ?? ''
      setState((s) => ({ ...s, claudemd: { content, lastSave: null } }))
      break
    }
    case 'claudemd_saved': {
      const ok = (e as any).ok
      setState((s) => ({ ...s, claudemd: { ...s.claudemd, lastSave: ok ? 'ok' : 'fail' } }))
      break
    }
    case 'memory_hits': {
      const m = e as any
      setState((s) => ({
        ...s,
        messages: s.messages.map((msg) => msg.id === m.message_id ? { ...msg, memoryHits: m.hits } : msg),
      }))
      break
    }
    case 'ack': {
      // hub 排除发送者的 broadcast，所以发送者只能靠 ack 确认 + 拿到 server id
      const a = e as any
      setState((s) => {
        const msgs = [...s.messages]
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'user' && msgs[i].pending) {
            msgs[i] = { ...msgs[i], id: a.id, pending: false }
            break
          }
        }
        return { ...s, messages: msgs }
      })
      break
    }
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const getSnapshot = () => state

export function useChatState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getChatClientOrInit(
  opts: Parameters<typeof createChatClient>[0]
): ChatClient {
  if (_client) return _client
  _client = createChatClient(opts)
  _client.on(handleEvent)
  return _client
}

let _tempIdCounter = 0
export function sendMessage(text: string, extra?: { style?: string; image?: any; file?: any; images?: string[]; files?: Array<{ url: string; name?: string }> }) {
  if (!_client) return
  const trimmed = text.trim()
  if (!trimmed && !extra?.image && !extra?.file && !extra?.images?.length && !extra?.files?.length) return
  const tempId = `local-${Date.now()}-${_tempIdCounter++}`
  setState((s) => ({
    ...s,
    messages: [
      ...s.messages.map((m) => m.autoExpanded ? { ...m, autoExpanded: false } : m),
      {
        id: tempId,
        role: 'user',
        content: trimmed,
        ts: Date.now(),
        image: extra?.image,
        file: extra?.file,
        images: extra?.images,
        files: extra?.files,
        pending: true,
      },
    ],
  }))
  _client.send({
    type: 'message',
    content: trimmed,
    style: extra?.style,
    image: extra?.image,
    file: extra?.file,
    images: extra?.images,
    files: extra?.files,
    hints_enabled: state.hintsEnabled,
    health_enabled: state.healthEnabled,
  })
}


export function sendRaw(msg: any): boolean {
  return _client?.send(msg) ?? false
}

export function sendSessionAction(action: string, extra?: Record<string, any>): boolean {
  if (action === 'session_forge') setState((s) => ({ ...s, actionPending: 'forge' }))
  else if (action === 'session_compact') setState((s) => ({ ...s, actionPending: 'compact' }))
  return sendRaw({ type: action, ...(extra ?? {}) })
}

export function loadMoreMessages() {
  setState((s) => ({ ...s, visibleCount: Math.min(s.visibleCount + 50, s.messages.length) }))
}

export function clearAutoExpanded(id: string) {
  setState((s) => ({ ...s, messages: s.messages.map((m) => m.id === id ? { ...m, autoExpanded: false } : m) }))
}

export function setHintsEnabled(enabled: boolean) {
  try { localStorage.setItem(HINTS_KEY, String(enabled)) } catch {}
  setState((s) => ({ ...s, hintsEnabled: enabled }))
}

export function setHealthEnabled(enabled: boolean) {
  try { localStorage.setItem(HEALTH_KEY, String(enabled)) } catch {}
  setState((s) => ({ ...s, healthEnabled: enabled }))
}


export function setTextColor(who: 'su' | 'you', color: string) {
  setState((s) => {
    const next = { ...s.textColors, [who]: color }
    try { localStorage.setItem(COLOR_KEY, JSON.stringify(next)) } catch {}
    applyTextColors(next)
    return { ...s, textColors: next }
  })
}


export function sendClaudemdGet() {
  sendRaw({ type: 'claudemd_get' })
}
export function sendClaudemdSave(content: string) {
  sendRaw({ type: 'claudemd_save', content })
}
