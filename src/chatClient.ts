// 客户端连接 hub WS (cc.atlantis-sy.blue → 127.0.0.1:3456)
// Step 1：底层连接 + PIN 鉴权 + 事件分发；无 UI 集成。
// 跨域 WS 浏览器允许（不受 CORS）；nginx 全路径反代含 Upgrade。

const WS_URL = 'wss://cc.atlantis-sy.blue/'
const PIN_KEY = 'sea-channel-pin'

export type HubEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'error'; message?: string }
  | { type: 'auth_required' }
  | { type: 'auth_ok'; client_id: string; cc_alive: boolean }
  | { type: 'auth_fail'; message?: string }
  | { type: 'history'; messages: any[] }
  | { type: 'cc_status'; alive: boolean }
  | { type: 'cc_busy'; busy: boolean }
  | { type: 'streaming_status'; phase: string; elapsed?: number }
  | { type: 'message'; id: string; role: 'user' | 'assistant' | 'activity'; content?: any; activities?: any; ts: number; image?: any; file?: any }
  | { type: 'thinking'; message_id: string; thinking: string }
  | { type: 'activity'; tool: string; detail?: any; ts: number }
  | { type: 'edit'; id: string; content: string; ts: number }
  | { type: 'ack'; id: string }
  | { type: 'memory_hits'; [k: string]: any }
  | { type: 'session_state'; [k: string]: any }
  | { type: 'thinking_start'; reply_to?: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'text_start'; reply_to?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'done'; id: string; role: string; content: string; thinking?: string; ts: string; reply_to?: string }
  | { type: string; [k: string]: any }

export type ChatClient = {
  send: (msg: any) => boolean
  on: (handler: (e: HubEvent) => void) => () => void
  close: () => void
  state: () => 'connecting' | 'open' | 'closed'
  clearPin: () => void
}

export function createChatClient(opts?: {
  url?: string
  promptPin?: () => string | null | Promise<string | null>
}): ChatClient {
  const url = opts?.url ?? WS_URL
  const promptPin = opts?.promptPin ?? (() => window.prompt('请输入 hub PIN'))

  let ws: WebSocket | null = null
  const handlers = new Set<(e: HubEvent) => void>()
  let reconnectTimer: number | null = null
  let reconnectAttempts = 0
  let manualClose = false

  const emit = (e: HubEvent) => {
    handlers.forEach((h) => {
      try { h(e) } catch (err) { console.error('[chatClient handler]', err) }
    })
  }

  const authWithPin = async () => {
    let pin = localStorage.getItem(PIN_KEY)
    if (!pin) {
      const entered = await Promise.resolve(promptPin())
      if (entered) {
        localStorage.setItem(PIN_KEY, entered)
        pin = entered
      }
    }
    if (pin && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'auth', pin }))
    }
  }

  const scheduleReconnect = () => {
    if (manualClose) return
    reconnectAttempts++
    const delay = reconnectAttempts === 1 ? 500 : Math.min(30_000, 1000 * Math.pow(2, Math.min(reconnectAttempts, 5)))
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(connect, delay)
  }

  const connect = () => {
    if (manualClose) return
    try {
      ws = new WebSocket(url)
    } catch (e) {
      emit({ type: 'error', message: String(e) })
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      reconnectAttempts = 0
      emit({ type: 'open' })
    }

    ws.onmessage = (ev) => {
      let msg: any
      try { msg = JSON.parse(ev.data) } catch { return }
      emit(msg as HubEvent)
      if (msg.type === 'auth_required') {
        authWithPin().catch((err) => emit({ type: 'error', message: String(err) }))
      } else if (msg.type === 'auth_fail') {
        localStorage.removeItem(PIN_KEY)
      }
    }

    ws.onclose = () => {
      emit({ type: 'close' })
      scheduleReconnect()
    }

    ws.onerror = () => {
      emit({ type: 'error', message: 'websocket error' })
    }
  }

  connect()

  // visibilitychange：切回前台立即检查 + 必要时强制重连
  const onVisibility = () => {
    if (manualClose) return
    if (document.visibilityState === 'visible') {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (reconnectTimer) window.clearTimeout(reconnectTimer)
        reconnectAttempts = 0
        connect()
      }
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  // 应用层 ping 每 20s 保活（hub 不识别会忽略，但流活跃避免中间盒杀）
  const pingTimer = window.setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'ping' })) } catch {}
    }
  }, 20000)

  return {
    send: (msg) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
        return true
      }
      return false
    },
    on: (handler) => {
      handlers.add(handler)
      return () => { handlers.delete(handler) }
    },
    close: () => {
      manualClose = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      window.clearInterval(pingTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      ws?.close()
    },
    state: () => {
      if (manualClose || !ws) return 'closed'
      if (ws.readyState === WebSocket.OPEN) return 'open'
      return 'connecting'
    },
    clearPin: () => localStorage.removeItem(PIN_KEY),
  }
}

let _client: ChatClient | null = null
export function getChatClient(): ChatClient {
  if (!_client) _client = createChatClient()
  return _client
}
