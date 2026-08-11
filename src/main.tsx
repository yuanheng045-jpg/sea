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
import { bootstrapAppPos } from './appPos'

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
bootstrapAppPos()

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

// —— iOS 软键盘高度 → CSS 变量 --kb ——
// Safari 不支持 interactive-widget=resizes-content，用 visualViewport 手动补：
// 键盘(含系统工具条)遮挡多高，--kb 就是多少；输入条/页面高度用它避让
const vvp = window.visualViewport
if (vvp) {
  let kbRaf = 0
  const syncKb = () => {
    kbRaf = 0
    const kb = Math.max(0, Math.round(window.innerHeight - vvp.height - vvp.offsetTop))
    // viewport-fit=cover 后 innerHeight/vvp.height 可能带安全区残差(~34/59px)被误判成键盘；只有明显高度才算
    const applied = kb > 70 ? kb : 0
    document.documentElement.style.setProperty('--kb', `${applied}px`)
    if (applied > 0 && window.scrollY !== 0) window.scrollTo(0, 0)
  }
  const queueKb = () => { if (!kbRaf) kbRaf = requestAnimationFrame(syncKb) }
  vvp.addEventListener('resize', queueKb)
  vvp.addEventListener('scroll', queueKb)
  syncKb()

}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
