import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
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

// 2. Async fetch remote
fetch('/api/status', { credentials: 'include' })
  .then(r => (r.ok ? r.json() : null))
  .then(data => {
    if (!data) return
    const entry = data['sea-theme']
    if (entry?.value === undefined) return
    applyTheme(entry.value)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entry.value)) } catch {}
  })
  .catch(() => {})

bootstrapIcons()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
