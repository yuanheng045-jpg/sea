type Vars = Record<string, string>
export type Tab = 'morning' | 'noon' | 'dusk' | 'night'
export type Presets = Record<Tab, Vars>

const ANCHORS: { tab: Tab; min: number }[] = [
  { tab: 'morning', min: 360  },  // 06:00
  { tab: 'noon',    min: 720  },  // 12:00
  { tab: 'dusk',    min: 1080 },  // 18:00
  { tab: 'night',   min: 1380 },  // 23:00
]

function parseHex(c: string): { r: number; g: number; b: number } | null {
  let s = c.trim().replace(/^#/, '')
  if (s.length === 3) s = s.split('').map(ch => ch + ch).join('')
  if (s.length !== 6) return null
  const n = parseInt(s, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map(n => n.toString(16).padStart(2, '0')).join('')
}

function isHexColor(v: string): boolean {
  return typeof v === 'string' && /^#[0-9A-Fa-f]+$/.test(v.trim())
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b)
  if (!pa || !pb) return a
  return toHex(pa.r + (pb.r - pa.r) * t, pa.g + (pb.g - pa.g) * t, pa.b + (pb.b - pa.b) * t)
}

function lerpUnit(a: string, b: string, t: number): string {
  const ma = a.match(/^(-?[\d.]+)(.*)$/)
  const mb = b.match(/^(-?[\d.]+)(.*)$/)
  if (!ma || !mb) return a
  const na = parseFloat(ma[1]), nb = parseFloat(mb[1])
  const unit = ma[2] || mb[2]
  const val = na + (nb - na) * t
  return `${Math.round(val * 10) / 10}${unit}`
}

export function lerpVars(a: Vars, b: Vars, t: number): Vars {
  const result: Vars = {}
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const va = a[k] ?? b[k]
    const vb = b[k] ?? a[k]
    if (isHexColor(va) && isHexColor(vb)) {
      result[k] = lerpHex(va, vb, t)
    } else {
      result[k] = lerpUnit(va, vb, t)
    }
  }
  return result
}

function beijingMinutesNow(): number {
  const n = new Date()
  const utcMin = n.getUTCHours() * 60 + n.getUTCMinutes()
  return (utcMin + 8 * 60) % 1440
}

export function computeDaylight(presets: Presets): Vars {
  const m = beijingMinutesNow()
  for (let i = 0; i < ANCHORS.length; i++) {
    const cur = ANCHORS[i]
    const nxt = ANCHORS[(i + 1) % ANCHORS.length]
    const start = cur.min
    const end = (i === ANCHORS.length - 1) ? (nxt.min + 1440) : nxt.min
    const adj = m < start ? m + 1440 : m
    if (adj >= start && adj < end) {
      const t = (adj - start) / (end - start)
      return lerpVars(presets[cur.tab], presets[nxt.tab], t)
    }
  }
  return presets.morning
}

function applyVarsFromObject(vars: Vars) {
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v)
  }
}

let _presets: Presets | null = null
let _interval: number | undefined

function tick() {
  if (_presets) applyVarsFromObject(computeDaylight(_presets))
}

export function startDaylight(presets: Presets) {
  _presets = presets
  tick()
  if (_interval !== undefined) clearInterval(_interval)
  _interval = window.setInterval(tick, 60_000)
}

export function stopDaylight() {
  if (_interval !== undefined) {
    clearInterval(_interval)
    _interval = undefined
  }
  _presets = null
}

export function isDaylightRunning(): boolean {
  return _interval !== undefined
}
