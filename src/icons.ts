import { useEffect, useState } from 'react'

export type IconKey = 'cc' | 'api' | 'voice' | 'reading' | 'play' | 'avatar-her' | 'avatar-his' | 'avatar-su' | 'avatar-you'
type Icons = Record<IconKey, string | null>

const DEFAULT: Icons = { cc: null, api: null, voice: null, reading: null, play: null, 'avatar-her': null, 'avatar-his': null, 'avatar-su': null, 'avatar-you': null }
let _icons: Icons = { ...DEFAULT }
const listeners = new Set<() => void>()
const STORAGE_KEY = 'sea:icons:v1'

function notify() {
  listeners.forEach(l => l())
}

export function applyIcons(next: Partial<Icons>) {
  _icons = { ..._icons, ...next }
  notify()
}

let pushTimer: number | undefined
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = window.setTimeout(async () => {
    try {
      await fetch('/api/status/sea-icons', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: _icons }),
      })
    } catch {}
  }, 500)
}

export function setIcon(key: IconKey, value: string | null) {
  _icons = { ..._icons, [key]: value }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_icons)) } catch {}
  notify()
  schedulePush()
}

export function useIcons(): Icons {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return _icons
}

export function bootstrapIcons() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') applyIcons(parsed)
    }
  } catch {}
  fetch('/api/status', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const entry = data?.['sea-icons']
      if (entry?.value && typeof entry.value === 'object') {
        applyIcons(entry.value)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_icons)) } catch {}
      }
    })
    .catch(() => {})
}

export async function resizeImage(file: File, maxSize = 256): Promise<string> {
  const dataURL = await new Promise<string>((res, rej) => {
    const reader = new FileReader()
    reader.onload = () => res(reader.result as string)
    reader.onerror = rej
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = dataURL
  })
  const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
  const w = Math.max(1, Math.round(img.width * ratio))
  const h = Math.max(1, Math.round(img.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const isPng = file.type === 'image/png'
  return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88)
}
