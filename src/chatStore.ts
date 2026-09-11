// Observable 状态层：chatClient 事件 → React 可订阅 state
// 给 sea 各组件一个统一的 chat 状态 + sendMessage 入口
import { useSyncExternalStore } from 'react'
import { createChatClient, type HubEvent, type ChatClient } from './chatClient'
import { livePush, liveEnd, liveCatchUp, liveDropPrefix, liveRename, liveKey } from './liveStream'
import { stripPaceMarks } from './paceMarks'

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
  keepsakes?: Keepsake[]
  pending?: boolean
  autoExpanded?: boolean
  memoryHits?: any[]
  fresh?: boolean
  usage?: any
  memSaved?: { ok: boolean; content: string }
  live?: { text?: boolean; thinking?: boolean }   // 正在直播（weir 直接写 DOM，content/thinking 结束前不进 state）
}

export type Keepsake = {
  id: string
  title?: string
  words: string
  page_url: string
  image_url: string
  price_snapshot?: string
  observed_at: string
  source: 'main-chat' | 'group-chat'
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
  actionPending: 'forge' | 'compact' | 'prune' | null
  actionResult: { action: string; ok: boolean; note?: string; ts: number } | null
  hintsEnabled: boolean
  healthEnabled: boolean
  timeEnabled: boolean
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

const TIME_KEY = 'sea-time-enabled'
function loadTime(): boolean {
  try {
    const raw = localStorage.getItem(TIME_KEY)
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
  actionResult: null,
  hintsEnabled: loadHints(),
  healthEnabled: loadHealth(),
  timeEnabled: loadTime(),
  textColors: loadTextColors(),
  claudemd: { content: null, lastSave: null },
}

const listeners = new Set<() => void>()
let _client: ChatClient | null = null
let _activityIdCounter = 0

function setState(updater: (s: State) => State) {
  state = updater(state)
  listeners.forEach((l) => l())
}

// ── 流式直播（2026-09-09 weir 顺滑流式）──
// delta 不再逐字进 state：交给 liveStream（weir 在 rAF 里均速落 DOM、只追加正在生长的段落），
// state 只在"开始直播"和"done"各动一次。旧的 setTimeout 排字器（.bak-20260830-smooth*）整段退役。
function pendingStreamId(): string | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i]
    if (m.role === 'assistant' && m.pending && m.id.startsWith('stream-')) return m.id
  }
  return null
}

function markLive(id: string, kind: 'text' | 'thinking') {
  const m = state.messages.find((x) => x.id === id)
  if (!m || m.live?.[kind]) return
  setState((s) => ({
    ...s,
    messages: s.messages.map((x) => x.id === id ? { ...x, live: { ...(x.live ?? {}), [kind]: true } } : x),
  }))
}

// gentle=true：上一条已结束、还在按节奏吐尾巴的流放它走完（苏煦连发两条时第一条不被瞬间写完）
function dropLiveStreams(gentle = false) { liveDropPrefix('stream-', gentle) }

// 苏煦回复里的 <!--pace:*--> 语速标记只给排字器看：进 state 的最终文本一律剥干净（渲染/复制都不可见）
function cleanMsg<T extends { role: string; content?: any }>(m: T): T {
  return m.role === 'assistant' && typeof m.content === 'string' && m.content.indexOf('<!--') !== -1
    ? { ...m, content: stripPaceMarks(m.content) }
    : m
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
      const msgs = (((e as any).messages ?? []) as ChatMessage[]).map(cleanMsg)
      dropLiveStreams()
      setState((s) => ({ ...s, messages: msgs, visibleCount: 50 }))
      break
    }
    case 'message': {
      const m = e as any as ChatMessage
      setState((s) => {
        if (s.messages.some((x) => x.id === m.id)) return s
        const settled = s.messages.map(x => x.role === 'activity' && x.pending ? { ...x, pending: false } : x)
        return { ...s, messages: [...settled, { ...cleanMsg(m), fresh: true }] }
      })
      break
    }
    case 'activity': {
      const a = e as any
      const ts = typeof a.ts === 'number' ? a.ts : Date.now()
      const activity = {
        id: String(a.id || `activity-${ts}-${_activityIdCounter++}`),
        tool: String(a.tool || a.name || 'tool'),
        detail: a.detail == null ? '' : a.detail,
        ts,
      }
      setState((s) => {
        const messages = [...s.messages]
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && messages[i].pending) {
            const activities = messages[i].activities ?? []
            if (activities.some((x: any) => x.id === activity.id)) return s
            messages[i] = { ...messages[i], activities: [...activities, activity] }
            return { ...s, messages }
          }
        }
        const last = messages[messages.length - 1]
        if (last?.role === 'activity' && last.pending) {
          const activities = last.activities ?? []
          if (activities.some((x: any) => x.id === activity.id)) return s
          messages[messages.length - 1] = { ...last, activities: [...activities, activity] }
        } else {
          messages.push({
            id: `activity-run-${ts}`,
            role: 'activity',
            content: '',
            activities: [activity],
            ts,
            pending: true,
          })
        }
        return { ...s, messages }
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
      const sameStream = e.type === 'text_start' && state.messages.some((m) => m.id === streamId && m.role === 'assistant' && m.pending)
      if (!sameStream) dropLiveStreams(true)
      if (!state.messages.some((m) => m.id === streamId)) {
        // 占位的 stream-wait-* 即将改名成 streamId：直播 sink 跟着改名（组件按新 id 重挂并追平）
        const wait = state.messages.find((m) => m.role === 'assistant' && m.pending && m.id.startsWith('stream-wait-'))
        if (wait) liveRename(wait.id, streamId)
      }
      setState((s) => {
        if (s.messages.some((m) => m.id === streamId)) return s
        const messages = [...s.messages]
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && messages[i].pending && messages[i].id.startsWith('stream-wait-')) {
            messages[i] = { ...messages[i], id: streamId, autoExpanded: true }
            return { ...s, messages }
          }
        }
        return {
          ...s,
          messages: [...messages, {
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
      const id = pendingStreamId()
      if (!id) break
      markLive(id, 'thinking')
      livePush(liveKey(id, 'thinking'), t.text)
      break
    }
    case 'text_delta': {
      const t = e as any
      const id = pendingStreamId()
      if (!id) break
      if (!state.messages.find((m) => m.id === id)?.live?.text) {
        liveCatchUp(liveKey(id, 'thinking'))   // 正文开口：思维链先落完（让路）
        markLive(id, 'text')
      }
      livePush(liveKey(id, 'text'), t.text)
      break
    }
    case 'done': {
      const d = e as any
      const streamId = pendingStreamId()
      const finish = () => setState((s) => {
        const msgs = [...s.messages]
        let replaced = false
        let idx = streamId ? msgs.findIndex((m) => m.id === streamId) : -1
        if (idx < 0) {
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant' && msgs[i].pending && msgs[i].id.startsWith('stream-')) { idx = i; break }
          }
        }
        if (idx >= 0) {
          const activities = msgs[idx].activities
          msgs[idx] = {
            id: d.id,
            role: 'assistant',
            content: stripPaceMarks(d.content ?? ''),
            thinking: d.thinking ?? undefined,
            ts: typeof d.ts === 'string' ? new Date(d.ts).getTime() : (d.ts ?? Date.now()),
            pending: false,
            autoExpanded: true,
            images: d.images, files: d.files, htmls: d.htmls, keepsakes: d.keepsakes,
            activities: d.activities ?? activities,
          }
          replaced = true
        }
        if (!replaced && !msgs.some((m) => m.id === d.id)) {
          msgs.push({
            id: d.id,
            role: 'assistant',
            content: stripPaceMarks(d.content ?? ''),
            thinking: d.thinking ?? undefined,
            ts: typeof d.ts === 'string' ? new Date(d.ts).getTime() : (d.ts ?? Date.now()),
            images: d.images, files: d.files, htmls: d.htmls, keepsakes: d.keepsakes,
            activities: d.activities,
          })
        }
        return { ...s, messages: msgs }
      })
      if (streamId) {
        // 等 weir 把缓冲里的尾巴均速吐完（DOM 完整）再换成最终渲染，否则尾巴会一口气倒出来
        Promise.all([liveEnd(liveKey(streamId, 'text')), liveEnd(liveKey(streamId, 'thinking'))])
          .catch((err) => console.error('[chat] live end', err))
          .then(() => { finish(); liveDropPrefix(streamId + ':') })
      } else finish()
      break
    }
    case 'error': {
      const id = pendingStreamId()
      if (id) { liveEnd(liveKey(id, 'text')); liveEnd(liveKey(id, 'thinking')) }
      break
    }
    case 'edit': {
      const ed = e as any
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === ed.id ? { ...m, content: typeof ed.content === 'string' ? stripPaceMarks(ed.content) : ed.content } : m
        ),
      }))
      break
    }
    case 'cc_status':
      setState((s) => ({ ...s, ccAlive: !!(e as any).alive }))
      break
    case 'cc_busy': {
      const busy = !!(e as any).busy
      if (busy && !state.messages.some((m) => m.role === 'assistant' && m.pending)) dropLiveStreams(true)
      setState((s) => {
        if (!busy) {
          return {
            ...s,
            ccBusy: false,
            messages: s.messages
              .filter((m) => !(m.role === 'assistant' && m.pending && !m.content && !m.thinking && !m.activities?.length && !m.live?.text && !m.live?.thinking))
              .map((m) => m.role === 'activity' && m.pending ? { ...m, pending: false } : m),
          }
        }
        if (s.messages.some((m) => m.role === 'assistant' && m.pending)) {
          return { ...s, ccBusy: busy }
        }
        return {
          ...s,
          ccBusy: true,
          messages: [...s.messages, {
            id: `stream-wait-${Date.now()}`,
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
      const r = e as any
      setState((s) => ({ ...s, actionPending: null, actionResult: { action: r.action, ok: !!r.ok, note: r.note, ts: Date.now() } }))
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
    time_enabled: state.timeEnabled,
  })
}


export function sendRaw(msg: any): boolean {
  return _client?.send(msg) ?? false
}

export function sendSessionAction(action: string, extra?: Record<string, any>): boolean {
  if (action === 'session_forge') setState((s) => ({ ...s, actionPending: 'forge' }))
  else if (action === 'session_compact') setState((s) => ({ ...s, actionPending: 'compact' }))
  else if (action === 'session_prune') setState((s) => ({ ...s, actionPending: 'prune' }))
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

export function setTimeEnabled(enabled: boolean) {
  try { localStorage.setItem(TIME_KEY, String(enabled)) } catch {}
  setState((s) => ({ ...s, timeEnabled: enabled }))
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
