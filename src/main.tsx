import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/cormorant-garamond/500-italic.css'
import '@fontsource/cormorant-garamond/600-italic.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'
import './index.css'
import { startDaylight, type Presets } from './daylight'
import { bootstrapIcons } from './icons'

const STORAGE_KEY = 'sea:theme:v2'
const LEGACY_KEY = 'sea:theme:v1'

type Vars = Record<string, string>
type ThemeData = { manual: Vars; presets: Presets; daylight?: boolean }

function applyVarsFromObject(vars: Vars) {
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v)
  }
}

function isThemeData(x: any): x is ThemeData {
  return x && typeof x === 'object' && 'presets' in x && 'manual' in x
}

function applyTheme(value: unknown) {
  if (!value || typeof value !== 'object') return
  if (isThemeData(value)) {
    if (value.daylight) {
      startDaylight(value.presets)
    } else {
      applyVarsFromObject(value.manual)
    }
  } else {
    applyVarsFromObject(value as Vars)
  }
}

// 1. Instant first paint from localStorage
try {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
  if (raw) applyTheme(JSON.parse(raw))
} catch {}

// 2. Async fetch remote (共享 Promise：theme + chatClient PIN 都用它)
const statusPromise: Promise<Record<string, { value: any; updated_at: string }> | null> =
  fetch('/api/status', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)

statusPromise.then(data => {
  if (!data) return
  const entry = data['sea-theme']
  if (entry?.value === undefined) return
  applyTheme(entry.value)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entry.value)) } catch {}
})

bootstrapIcons()

// Step 1 验收：底层 WS 连通 + 鉴权 + history。
// PIN 从 /api/status 拿，UI 永不弹框；fetch 炸了再回退 prompt。
import { getChatClientOrInit } from './chatStore'
const hubClient = getChatClientOrInit({
  promptPin: async () => {
    try {
      const data = await statusPromise
      const fromServer = data?.['sea-channel-pin']?.value
      if (typeof fromServer === 'string' && fromServer) return fromServer
    } catch {}
    return window.prompt('请输入 hub PIN')
  }
})
;(window as any).hubClient = hubClient

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
