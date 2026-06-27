import { useEffect, useState } from 'react'

export type Pos = { x: number; y: number }   // 百分比 0..100，图标中心点
type PosMap = Record<string, Pos>

let _pos: PosMap = {}
const listeners = new Set<() => void>()
const STORAGE_KEY = 'sea:apppos:v1'

function notify() { listeners.forEach(l => l()) }

export function applyAppPos(next: PosMap) {
  _pos = { ..._pos, ...next }
  notify()
}

let pushTimer: number | undefined
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = window.setTimeout(async () => {
    try {
      await fetch('/api/status/sea-apppos', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: _pos }),
      })
    } catch {}
  }, 500)
}

export function setAppPos(key: string, value: Pos) {
  _pos = { ..._pos, [key]: value }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_pos)) } catch {}
  notify()
  schedulePush()
}

export function useAppPos(): PosMap {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return _pos
}

export function bootstrapAppPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') applyAppPos(parsed)
    }
  } catch {}
  fetch('/api/status', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const entry = data?.['sea-apppos']
      if (entry?.value && typeof entry.value === 'object') {
        applyAppPos(entry.value)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_pos)) } catch {}
      }
    })
    .catch(() => {})
}
