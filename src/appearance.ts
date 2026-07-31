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
  thinkingColor: string
  textSize: number
  thinkingSize: number
}

const DEFAULT_APPEARANCE: Appearance = {
  bgMode: 'blob',
  bgColor: '#1a3050',
  bgImages: [],
  bgCurrent: 0,
  bgDim: 18,
  bubbles: false,
  thinkingColor: '#6f7888',
  // 0 = 沿用页面原有字号；第一次拖动滑杆后才写入自定义值，避免升级时改变现有观感。
  textSize: 0,
  thinkingSize: 0,
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
  body.style.setProperty('--text-thinking', v.thinkingColor)
  const textSize = Number(v.textSize)
  if (Number.isFinite(textSize) && textSize > 0) {
    body.setAttribute('data-chat-text-size', 'custom')
    body.style.setProperty('--chat-text-size', textSize + 'px')
  } else {
    body.removeAttribute('data-chat-text-size')
    body.style.removeProperty('--chat-text-size')
  }
  const thinkingSize = Number(v.thinkingSize)
  if (Number.isFinite(thinkingSize) && thinkingSize > 0) {
    body.setAttribute('data-chat-thinking-size', 'custom')
    body.style.setProperty('--chat-thinking-size', thinkingSize + 'px')
  } else {
    body.removeAttribute('data-chat-thinking-size')
    body.style.removeProperty('--chat-thinking-size')
  }
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
