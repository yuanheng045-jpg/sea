// 聊天外观偏好的持久化 + body data-attr 驱动
// 切换由 sidebar 的 AppearancePanel 写入,body 上的 data-* 与 CSS 变量负责渲染
import { useSyncExternalStore } from 'react'

const KEY = 'sea-chat-appearance'

export type ChatBgMode = 'blob' | 'color' | 'image'
export type Appearance = {
  bgMode: ChatBgMode
  bgColor: string
  bgImages: string[]
  bgCurrent: number
  bgDim: number
  bubbles: boolean
}

const DEFAULT_APPEARANCE: Appearance = {
  bgMode: 'blob',
  bgColor: '#1a3050',
  bgImages: [],
  bgCurrent: 0,
  bgDim: 18,
  bubbles: false,
}

let cache: Appearance | null = null
const listeners = new Set<() => void>()

function load(): Appearance {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_APPEARANCE, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_APPEARANCE }
}

function persist(a: Appearance) {
  cache = a
  try { localStorage.setItem(KEY, JSON.stringify(a)) } catch {}
  apply(a)
  listeners.forEach(fn => fn())
}

export function apply(a?: Appearance) {
  const v = a || getAppearance()
  const body = document.body
  body.setAttribute('data-chat-bg-mode', v.bgMode)
  body.setAttribute('data-chat-bubbles', v.bubbles ? 'on' : 'off')
  body.style.setProperty('--chat-bg-color', v.bgColor)
  body.style.setProperty('--chat-bg-dim', String(v.bgDim / 100))
  const img = v.bgImages[v.bgCurrent]
  if (img) body.style.setProperty('--chat-bg-image', `url("${img.replace(/"/g, '\\"')}")`)
  else body.style.removeProperty('--chat-bg-image')
}

export function getAppearance(): Appearance {
  if (!cache) cache = load()
  return cache
}

export function updateAppearance(patch: Partial<Appearance>) {
  persist({ ...getAppearance(), ...patch })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance, () => DEFAULT_APPEARANCE)
}

// 启动时立即 apply 一次
if (typeof window !== 'undefined') {
  apply()
}
