// 玻璃引擎切换（2026-09-16 原瑶）：柔玻璃 soft = 现用 CSS 毛玻璃；液态玻璃 hyalite = 真折射（VII-Cae/hyalite--liquid-glass）
// ThemePanel「玻璃 · 全局」写进 sea-theme.glass 跨设备同步；main.tsx 启动时 applyGlass；CSS 只看 html[data-glass] / [data-glass-edge]
// 引擎只在 Chromium 渲染（backdrop-filter:url(#svg)，WebKit 实现仍在评审）：不支持的设备落 data-glass=hyalite-fallback = 柔玻璃原样
import './vendor/hyalite.js'

export type GlassMode = 'soft' | 'hyalite'
export type GlassParams = {
  bevel: number; thickness: number; slope: number; blur: number; dispersion: number
  shade: number; rim: number; sat: number; edge: number; light: number
}
export type GlassSetting = { mode: GlassMode; params: GlassParams }

// 跟主页 .glass 对齐过的四个玻璃面（见 index.css「玻璃精确对齐」）。排除项与 index.css「玻璃 B」块保持一致：
// .cc-modal/.st-modal 的父层 *-modal-backdrop 自带 backdrop-filter → 成 backdrop root，SVG 滤镜只看到透明层会整块发黑；
// .tb-page 里的本就关了 backdrop-filter 防发热
export const GLASS_SELECTOR = '.glass:not(.cc-modal):not(.st-modal):not(.tb-page *), .dock-edge, .dock-pill, .cc-input-pill'

const D = window.Hyalite.DEFAULTS
export const GLASS_DEFAULTS: GlassParams = {
  bevel: D.bevel, thickness: D.thickness, slope: D.slope, blur: D.blur, dispersion: D.dispersion,
  shade: D.shade, rim: D.rim, sat: D.sat, edge: D.edge, light: D.light,
}

export function normalizeGlass(x: unknown): GlassSetting {
  const o = (x && typeof x === 'object') ? x as Record<string, unknown> : {}
  const mode: GlassMode = o.mode === 'hyalite' ? 'hyalite' : 'soft'
  const params = { ...GLASS_DEFAULTS }
  const p = (o.params && typeof o.params === 'object') ? o.params as Record<string, unknown> : {}
  for (const k of Object.keys(params) as (keyof GlassParams)[]) {
    const v = Number(p[k])
    if (Number.isFinite(v)) params[k] = v
  }
  return { mode, params }
}

export function hyaliteSupported(): boolean {
  return window.Hyalite.supported()
}

let watcher: { stop(): void } | null = null

export function applyGlass(g: GlassSetting) {
  const html = document.documentElement
  const H = window.Hyalite
  if (g.mode === 'hyalite' && H.supported()) {
    html.dataset.glass = 'hyalite'
    // 描边滑杆 = 0 → 不接管 box-shadow / ::after，沿用原 135° 渐隐描边 + 七层阴影（只换折射）
    html.dataset.glassEdge = g.params.edge > 0 ? 'on' : 'off'
    if (watcher) void H.setOpts(g.params)
    else watcher = H.watch(document.body, GLASS_SELECTOR, g.params)
  } else {
    if (watcher) { watcher.stop(); watcher = null }
    html.dataset.glass = g.mode === 'hyalite' ? 'hyalite-fallback' : 'soft'
    delete html.dataset.glassEdge
  }
}
