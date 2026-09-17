import { useEffect, useRef, useState } from 'react'
import { startDaylight, stopDaylight } from './daylight'
import { applyGlass, hyaliteSupported, normalizeGlass, GLASS_DEFAULTS, type GlassMode, type GlassParams, type GlassSetting } from './glass'

type Ctrl =
  | { key: string; label: string; type: 'color'; default: string }
  | { key: string; label: string; type: 'range'; unit: string; min: number; max: number; step: number; default: number }

const SECTIONS: { title: string; controls: Ctrl[] }[] = [
  {
    title: 'Blob 1 · 中心蓝核',
    controls: [
      { key: '--blob1-core',      label: '核心色', type: 'color', default: '#146aff' },
      { key: '--blob1-edge',      label: '晕色',   type: 'color', default: '#ffffff' },
      { key: '--blob1-core-stop', label: '核心 %', type: 'range', unit: '%',    min: 0,  max: 50,  step: 1, default: 1  },
      { key: '--blob1-size',      label: '大小',   type: 'range', unit: 'vmax', min: 0,  max: 120, step: 1, default: 74 },
      { key: '--blob1-duration',  label: '周期',   type: 'range', unit: 's',    min: 1,  max: 60,  step: 1, default: 20 },
      { key: '--blob1-sweep',     label: '幅度',   type: 'range', unit: 'vw',   min: 0,  max: 50,  step: 1, default: 19 },
    ],
  },
  {
    title: 'Blob 2 · 金',
    controls: [
      { key: '--blob2-core',      label: '核心色', type: 'color', default: '#E8D5B0' },
      { key: '--blob2-edge',      label: '晕色',   type: 'color', default: '#ffffff' },
      { key: '--blob2-core-stop', label: '核心 %', type: 'range', unit: '%',    min: 0, max: 100, step: 1, default: 35 },
      { key: '--blob2-size',      label: '大小',   type: 'range', unit: 'vmax', min: 0, max: 120, step: 1, default: 20 },
      { key: '--blob2-duration',  label: '周期',   type: 'range', unit: 's',    min: 1, max: 60,  step: 1, default: 5  },
      { key: '--blob2-sweep',     label: '幅度',   type: 'range', unit: 'vw',   min: 0, max: 50,  step: 1, default: 20 },
    ],
  },
  {
    title: 'Blob 3 · 蓝',
    controls: [
      { key: '--blob3-core',      label: '核心色', type: 'color', default: '#1493e0' },
      { key: '--blob3-edge',      label: '晕色',   type: 'color', default: '#ffffff' },
      { key: '--blob3-core-stop', label: '核心 %', type: 'range', unit: '%',    min: 0, max: 100, step: 1, default: 70 },
      { key: '--blob3-size',      label: '大小',   type: 'range', unit: 'vmax', min: 0, max: 120, step: 1, default: 20 },
      { key: '--blob3-duration',  label: '周期',   type: 'range', unit: 's',    min: 1, max: 60,  step: 1, default: 5  },
      { key: '--blob3-sweep',     label: '幅度',   type: 'range', unit: 'vw',   min: 0, max: 50,  step: 1, default: 20 },
    ],
  },
  {
    title: 'Blob 4 · 雾白',
    controls: [
      { key: '--blob4-core',      label: '核心色', type: 'color', default: '#ffffff' },
      { key: '--blob4-edge',      label: '晕色',   type: 'color', default: '#ffffff' },
      { key: '--blob4-core-stop', label: '核心 %', type: 'range', unit: '%',    min: 0, max: 100, step: 1, default: 70 },
      { key: '--blob4-size',      label: '大小',   type: 'range', unit: 'vmax', min: 0, max: 120, step: 1, default: 60 },
      { key: '--blob4-duration',  label: '周期',   type: 'range', unit: 's',    min: 1, max: 60,  step: 1, default: 17 },
      { key: '--blob4-sweep',     label: '幅度',   type: 'range', unit: 'vw',   min: 0, max: 50,  step: 1, default: 18 },
    ],
  },
]

// 液态玻璃（hyalite）参数滑杆：范围照引擎 LIMITS 收窄到日常可用区间，默认值取自引擎 DEFAULTS
type GlassCtrl = { key: keyof GlassParams; label: string; unit: string; min: number; max: number; step: number }
const GLASS_CONTROLS: GlassCtrl[] = [
  { key: 'bevel',      label: '倒角', unit: 'px', min: 1,    max: 120, step: 1    },
  { key: 'thickness',  label: '厚度', unit: 'px', min: 0,    max: 200, step: 1    },
  { key: 'slope',      label: '折叠', unit: '',   min: 0.2,  max: 4,   step: 0.1  },
  { key: 'blur',       label: '磨砂', unit: 'px', min: 0,    max: 12,  step: 0.5  },
  { key: 'dispersion', label: '色散', unit: 'px', min: 0,    max: 6,   step: 0.1  },
  { key: 'shade',      label: '压暗', unit: '',   min: 0,    max: 2,   step: 0.02 },
  { key: 'rim',        label: '边光', unit: '',   min: 0,    max: 4,   step: 0.02 },
  { key: 'sat',        label: '饱和', unit: '',   min: 0,    max: 3,   step: 0.02 },
  { key: 'edge',       label: '描边', unit: '',   min: 0,    max: 2,   step: 0.02 },
  { key: 'light',      label: '光向', unit: '°',  min: -180, max: 180, step: 5    },
]

const TABS = [
  { key: 'morning' as const, label: '早晨', time: '06:00' },
  { key: 'noon'    as const, label: '中午', time: '12:00' },
  { key: 'dusk'    as const, label: '傍晚', time: '18:00' },
  { key: 'night'   as const, label: '深夜', time: '23:00' },
]
type Tab = typeof TABS[number]['key']

type Vars = Record<string, string>
type Presets = Record<Tab, Vars>
type ThemeData = { manual: Vars; presets: Presets; daylight: boolean; glass: GlassSetting }

const DEFAULT_PRESETS: Presets = {
  morning: {
    '--blob1-core': '#A8C8F0', '--blob1-edge': '#FFFFFF', '--blob1-core-stop': '3%',
    '--blob1-size': '74vmax',  '--blob1-duration': '20s', '--blob1-sweep': '19vw',
    '--blob2-core': '#FFFFFF', '--blob2-edge': '#FFFFFF', '--blob2-core-stop': '70%',
    '--blob2-size': '0vmax',   '--blob2-duration': '20s', '--blob2-sweep': '0vw',
    '--blob3-core': '#C8DAF0', '--blob3-edge': '#FFFFFF', '--blob3-core-stop': '70%',
    '--blob3-size': '30vmax',  '--blob3-duration': '25s', '--blob3-sweep': '15vw',
    '--blob4-core': '#FFFFFF', '--blob4-edge': '#FFFFFF', '--blob4-core-stop': '70%',
    '--blob4-size': '0vmax',   '--blob4-duration': '17s', '--blob4-sweep': '0vw',
  },
  noon: {
    '--blob1-core': '#146aff', '--blob1-edge': '#FFFFFF', '--blob1-core-stop': '1%',
    '--blob1-size': '74vmax',  '--blob1-duration': '20s', '--blob1-sweep': '19vw',
    '--blob2-core': '#E8D5B0', '--blob2-edge': '#FFFFFF', '--blob2-core-stop': '35%',
    '--blob2-size': '20vmax',  '--blob2-duration': '5s',  '--blob2-sweep': '20vw',
    '--blob3-core': '#1493e0', '--blob3-edge': '#FFFFFF', '--blob3-core-stop': '70%',
    '--blob3-size': '20vmax',  '--blob3-duration': '5s',  '--blob3-sweep': '20vw',
    '--blob4-core': '#FFFFFF', '--blob4-edge': '#FFFFFF', '--blob4-core-stop': '70%',
    '--blob4-size': '60vmax',  '--blob4-duration': '17s', '--blob4-sweep': '18vw',
  },
  dusk: {
    '--blob1-core': '#3A60C8', '--blob1-edge': '#F0D4A0', '--blob1-core-stop': '5%',
    '--blob1-size': '74vmax',  '--blob1-duration': '20s', '--blob1-sweep': '19vw',
    '--blob2-core': '#F0D4A0', '--blob2-edge': '#FFE5B8', '--blob2-core-stop': '40%',
    '--blob2-size': '40vmax',  '--blob2-duration': '12s', '--blob2-sweep': '25vw',
    '--blob3-core': '#5A82E0', '--blob3-edge': '#F5E8D0', '--blob3-core-stop': '60%',
    '--blob3-size': '30vmax',  '--blob3-duration': '15s', '--blob3-sweep': '18vw',
    '--blob4-core': '#FFE0B8', '--blob4-edge': '#FFFFFF', '--blob4-core-stop': '70%',
    '--blob4-size': '50vmax',  '--blob4-duration': '17s', '--blob4-sweep': '18vw',
  },
  night: {
    '--blob1-core': '#0E2A60', '--blob1-edge': '#1A3870', '--blob1-core-stop': '5%',
    '--blob1-size': '74vmax',  '--blob1-duration': '30s', '--blob1-sweep': '12vw',
    '--blob2-core': '#1A3870', '--blob2-edge': '#1A3870', '--blob2-core-stop': '70%',
    '--blob2-size': '30vmax',  '--blob2-duration': '8s',  '--blob2-sweep': '15vw',
    '--blob3-core': '#0E2A60', '--blob3-edge': '#1A3870', '--blob3-core-stop': '70%',
    '--blob3-size': '30vmax',  '--blob3-duration': '8s',  '--blob3-sweep': '15vw',
    '--blob4-core': '#1A3870', '--blob4-edge': '#0E2A60', '--blob4-core-stop': '70%',
    '--blob4-size': '60vmax',  '--blob4-duration': '17s', '--blob4-sweep': '18vw',
  },
}

const STORAGE_KEY = 'sea:theme:v2'
const LEGACY_KEY = 'sea:theme:v1'

function isThemeData(x: any): x is ThemeData {
  return x && typeof x === 'object' && 'presets' in x && 'manual' in x
}

function migrate(value: any): ThemeData {
  if (isThemeData(value)) {
    return {
      manual: value.manual ?? {},
      presets: {
        morning: { ...DEFAULT_PRESETS.morning, ...value.presets?.morning },
        noon:    { ...DEFAULT_PRESETS.noon,    ...value.presets?.noon    },
        dusk:    { ...DEFAULT_PRESETS.dusk,    ...value.presets?.dusk    },
        night:   { ...DEFAULT_PRESETS.night,   ...value.presets?.night   },
      },
      daylight: Boolean((value as any).daylight),
      glass: normalizeGlass((value as any).glass),
    }
  }
  const flat = (value && typeof value === 'object') ? value as Vars : {}
  return {
    manual: flat,
    presets: {
      morning: { ...DEFAULT_PRESETS.morning },
      noon:    { ...DEFAULT_PRESETS.noon, ...flat },
      dusk:    { ...DEFAULT_PRESETS.dusk },
      night:   { ...DEFAULT_PRESETS.night },
    },
    daylight: false,
    glass: normalizeGlass(null),
  }
}

function loadInitial(): ThemeData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (raw) return migrate(JSON.parse(raw))
  } catch {}
  return migrate(null)
}

function valueOf(ctrl: Ctrl, vars: Vars): string {
  const v = vars[ctrl.key]
  if (v !== undefined) return v
  if (ctrl.type === 'color') return ctrl.default
  return `${ctrl.default}${ctrl.unit}`
}

function numericOf(ctrl: Ctrl, vars: Vars): number {
  if (ctrl.type !== 'range') return 0
  const v = vars[ctrl.key]
  if (v) {
    const n = parseFloat(v)
    if (!Number.isNaN(n)) return n
  }
  return ctrl.default
}

function applyVars(vars: Vars) {
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
}

async function fetchRemote(): Promise<ThemeData | null> {
  try {
    const res = await fetch('/api/status', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    const entry = data['sea-theme']
    if (entry?.value !== undefined) return migrate(entry.value)
    return null
  } catch {
    return null
  }
}

async function pushRemote(data: ThemeData): Promise<boolean> {
  try {
    const res = await fetch('/api/status/sea-theme', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: data }),
    })
    return res.ok
  } catch {
    return false
  }
}

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

export function ThemePanel({ onBack }: { onBack?: () => void }) {
  const [data, setData] = useState<ThemeData>(loadInitial)
  const [tab, setTab] = useState<Tab>('noon')
  const [sync, setSync] = useState<SyncStatus>('idle')
  const skipPushRef = useRef(false)
  const manualRef = useRef(data.manual)
  const dataRef = useRef(data)
  const pendingRef = useRef(false)

  useEffect(() => { manualRef.current = data.manual }, [data.manual])
  useEffect(() => { dataRef.current = data }, [data])

  // Mount: pause daylight loop + fetch remote; on unmount restore (daylight or manual)
  useEffect(() => {
    let cancelled = false
    stopDaylight()
    setSync('syncing')
    fetchRemote().then(remote => {
      if (cancelled) return
      if (remote) {
        skipPushRef.current = true
        setData(remote)
        setSync('synced')
      } else {
        setSync('idle')
      }
    })
    return () => {
      cancelled = true
      const d = dataRef.current
      if (pendingRef.current) { pendingRef.current = false; void pushRemote(d) }
      if (d.daylight) {
        startDaylight(d.presets)
      } else {
        applyVars(d.manual)
      }
    }
  }, [])

  // Preview current preset whenever tab or preset content changes
  useEffect(() => {
    applyVars(data.presets[tab])
  }, [tab, data.presets])

  // 玻璃是全局的（不分时段），改了就立刻套到整站；退出面板不用还原
  useEffect(() => {
    applyGlass(data.glass)
  }, [data.glass])

  // Save: localStorage + debounce push
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
    if (skipPushRef.current) {
      skipPushRef.current = false
      return
    }
    setSync('syncing')
    pendingRef.current = true
    const t = setTimeout(async () => {
      const ok = await pushRemote(data)
      pendingRef.current = false
      setSync(ok ? 'synced' : 'error')
    }, 500)
    return () => clearTimeout(t)
  }, [data])

  const update = (key: string, value: string) =>
    setData(d => ({
      ...d,
      presets: { ...d.presets, [tab]: { ...d.presets[tab], [key]: value } },
    }))

  const resetTab = () =>
    setData(d => ({
      ...d,
      presets: { ...d.presets, [tab]: { ...DEFAULT_PRESETS[tab] } },
    }))

  const applyToManual = () =>
    setData(d => ({ ...d, manual: { ...d.presets[tab] } }))

  const toggleDaylight = () =>
    setData(d => ({ ...d, daylight: !d.daylight }))

  const setGlassMode = (mode: GlassMode) =>
    setData(d => ({ ...d, glass: { ...d.glass, mode } }))

  const updateGlass = (key: keyof GlassParams, value: number) =>
    setData(d => ({ ...d, glass: { ...d.glass, params: { ...d.glass.params, [key]: value } } }))

  const resetGlass = () =>
    setData(d => ({ ...d, glass: { ...d.glass, params: { ...GLASS_DEFAULTS } } }))

  const exportCSS = async () => {
    const vars = data.presets[tab]
    const lines: string[] = [`/* sea-theme · ${TABS.find(t => t.key === tab)?.label} */`, ':root {']
    for (const sec of SECTIONS) {
      for (const c of sec.controls) {
        lines.push(`  ${c.key}: ${valueOf(c, vars)};`)
      }
    }
    lines.push('}')
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      alert(`已复制「${TABS.find(t => t.key === tab)?.label}」preset CSS`)
    } catch {
      console.log(text)
      alert('剪贴板不可用，已 console.log')
    }
  }

  const currentVars = data.presets[tab]
  const currentTab = TABS.find(t => t.key === tab)!
  const glass = data.glass
  const liquid = glass.mode === 'hyalite'

  return (
    <div className="theme-panel">
      <header className="tp-header">
        <div className="tp-head-left">
        {onBack && <button className="tp-back" onClick={onBack} aria-label="返回">‹</button>}
        <h2 className="tp-title">
          主题面板
          {sync === 'syncing' && <span className="tp-sync">· 同步中</span>}
          {sync === 'synced'  && <span className="tp-sync tp-sync-ok">· 已同步</span>}
          {sync === 'error'   && <span className="tp-sync tp-sync-err">· 同步失败</span>}
        </h2>
        </div>
        <div className="tp-actions">
          <button className="tp-btn" onClick={resetTab}>重置当前</button>
          <button className="tp-btn" onClick={applyToManual}>设为常态</button>
          <button className="tp-btn tp-btn-primary" onClick={exportCSS}>导出 CSS</button>
        </div>
      </header>

      <details className="glass tp-section" open>
        <summary className="tp-summary">玻璃 · 全局</summary>
        <div className="tp-controls">
          <div className="tp-tabs">
            <button
              className={`tp-tab${!liquid ? ' active' : ''}`}
              onClick={() => setGlassMode('soft')}
            >
              <span>柔玻璃</span>
              <small>现用 · 全设备</small>
            </button>
            <button
              className={`tp-tab${liquid ? ' active' : ''}`}
              onClick={() => setGlassMode('hyalite')}
            >
              <span>液态玻璃</span>
              <small>hyalite · 真折射</small>
            </button>
          </div>
          {liquid && !hyaliteSupported() && (
            <div className="tp-hint">
              这台设备的浏览器还画不出真折射（iPhone 上所有浏览器都是 WebKit，Apple 的实现仍在评审），
              这里先照旧显示柔玻璃；PC 的 Chrome / Edge 打开就是液态玻璃
            </div>
          )}
          {liquid && GLASS_CONTROLS.map(c => (
            <div key={c.key} className="tp-row">
              <label className="tp-label">{c.label}</label>
              <div className="tp-range-wrap">
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={glass.params[c.key]}
                  onChange={e => updateGlass(c.key, parseFloat(e.target.value))}
                />
                <span className="tp-value">{glass.params[c.key]}{c.unit}</span>
              </div>
            </div>
          ))}
          {liquid && (
            <div className="tp-hint">描边 0 = 沿用原来的 135° 渐隐描边，只换折射 · 折叠 &gt; 1 才有液态漩涡</div>
          )}
          {liquid && (
            <div className="tp-actions">
              <button className="tp-btn" onClick={resetGlass}>重置玻璃参数</button>
            </div>
          )}
        </div>
      </details>

      <div className="tp-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tp-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
            <small>{t.time}</small>
          </button>
        ))}
        <button
          className={`tp-tab tp-daylight${data.daylight ? ' active' : ''}`}
          onClick={toggleDaylight}
          title="开启后退出面板由算法按北京时间在 4 套间插值"
        >
          <span>天光</span>
          <small>{data.daylight ? '开' : '关'}</small>
        </button>
      </div>

      <div className="tp-hint">
        正在编辑「{currentTab.label}」 · 背景实时预览
        {data.daylight && <span> · 退出后由天光算法接管</span>}
      </div>

      {SECTIONS.map(sec => (
        <details key={sec.title} className="glass tp-section" open>
          <summary className="tp-summary">{sec.title}</summary>
          <div className="tp-controls">
            {sec.controls.map(ctrl => (
              <div key={ctrl.key} className="tp-row">
                <label className="tp-label">{ctrl.label}</label>
                {ctrl.type === 'color' ? (
                  <div className="tp-color-wrap">
                    <input
                      type="color"
                      value={valueOf(ctrl, currentVars)}
                      onChange={e => update(ctrl.key, e.target.value)}
                    />
                    <span className="tp-value">{valueOf(ctrl, currentVars)}</span>
                  </div>
                ) : (
                  <div className="tp-range-wrap">
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={numericOf(ctrl, currentVars)}
                      onChange={e => update(ctrl.key, `${e.target.value}${ctrl.unit}`)}
                    />
                    <span className="tp-value">{numericOf(ctrl, currentVars)}{ctrl.unit}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
