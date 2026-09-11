// liveStream.tsx — 流式回复的"直播管线"（2026-09-09，weir 顺滑流式）
//
// 思路：正在生成的回复不再逐字 setState 让 React 全量重渲染，而是把 delta 交给 weir，
// 由 rAF 均速落进 DOM（只追加正在生长的段落，每帧新字淡入）；流结束后 await end()，
// DOM 到齐了再换成最终的 React 渲染（Markdown / 卡片 / 时间戳）。
// 主聊天 chatStore、备用引擎 apiChat、客厅 GroupPage、共读 ReadingPage 共用这一套。
//
// 用法：
//   store 侧：livePush(liveKey(id,'text'), delta) → … → await liveEnd(key) → 写最终 state → liveDropPrefix(id+':')
//   组件侧：<LiveText id={msg.id} kind="text" … />  挂上就自动接上同名 sink（晚挂载会先追平已收到的部分）
//   页面侧：onLiveGrow(() => 贴底滚动)  每帧落字后回调，用来跟随滚动（自己维护"是否贴底"）
import { useEffect, useRef } from 'react'
import { Flow, type FlowOptions } from './weir'
import { INLINE_SRC, SAFE_HREF } from './miniMarkdown'
import { PaceScanner, PACES, type PaceName } from './paceMarks'

export type LiveKind = 'text' | 'thinking'
export const liveKey = (id: string, kind: LiveKind) => `${id}:${kind}`

// 中文按字计速：上游 README 建议 CJK 把 catchup 降到 0.22 左右。正文的字速上限/淡入/停顿以 PACES.default 为准
// （2026-09-09 晚定为 26 字/秒的「从容」档）；思维链是湍流，不限速、不停顿、不做句末沉。
export const TEXT_TUNING: Partial<FlowOptions> = { catchup: 0.22, catchupEnd: 0.09, minCps: 8, ...PACES.default }
export const THINKING_TUNING: Partial<FlowOptions> = { catchup: 0.16, catchupEnd: 0.06, minCps: 20, maxCps: 6000 }

type Sink = {
  text: string                       // 收到的全部（不管有没有组件挂着）
  ended: boolean                     // 上游已结束
  flow: Flow | null                  // 当前挂着的 weir 流（组件卸载即 null）
  endPromise: Promise<void> | null
  scanner: PaceScanner | null        // 正文 sink 的标记扫描器（缓冲池入口剥 <!--pace:*-->）
  pace: PaceName | null              // 这条消息的档位（只认开头的标记，一条一个）
}
const sinks = new Map<string, Sink>()
function sink(key: string): Sink {
  let s = sinks.get(key)
  if (!s) { s = { text: '', ended: false, flow: null, endPromise: null, scanner: key.endsWith(':text') ? new PaceScanner() : null, pace: null }; sinks.set(key, s) }
  return s
}

/** 喂一个 delta。有组件挂着就直接进 weir；没有就先攒着，挂上时追平。 */
export function livePush(key: string, text: unknown) {
  let t = typeof text === 'string' ? text : (text == null ? '' : String(text))
  if (!t) return
  const s = sink(key)
  if (s.ended) return
  if (s.scanner) {
    // 缓冲池入口：剥掉 pace 标记；只认消息开头的那个，且必须在任何字上屏之前定档（一条消息一个档）
    const r = s.scanner.feed(t)
    if (r.pace && s.pace === null) { s.pace = r.pace; if (s.flow) s.flow.setPace(PACES[r.pace]) }
    t = r.text
    if (!t) return
  }
  s.text += t
  if (s.flow) s.flow.push(t)
}

/** 上游结束。resolve 时 DOM 已完整（没有组件挂着则立即 resolve）。 */
export function liveEnd(key: string): Promise<void> {
  const s = sinks.get(key)
  if (!s) return Promise.resolve()
  if (!s.ended) {
    s.ended = true
    if (s.scanner) {                                         // 扣住的半截不是标记：按普通文字放出来
      const rest = s.scanner.end()
      if (rest) { s.text += rest; if (s.flow) s.flow.push(rest) }
    }
    s.endPromise = s.flow ? s.flow.end() : Promise.resolve()
  }
  return s.endPromise ?? Promise.resolve()
}

/** 已收到的立刻全部落地、不关流（正文开口时让思维链先落完）。 */
export function liveCatchUp(key: string) {
  const s = sinks.get(key)
  if (s?.flow) s.flow.catchUp()
}

/** 丢掉一个 sink。未结束的直接取消；已结束的：gentle=true 放它按自己的节奏吐完（下一条开始时上一条
 *  不该被瞬间写完——限速模式下尾巴可能还有好几秒），否则立刻写完关掉（重连/换房间/清窗）。 */
export function liveDrop(key: string, gentle = false) {
  const s = sinks.get(key)
  if (!s) return
  if (s.flow) {
    if (!s.ended) s.flow.cancel()
    else if (!gentle) s.flow.flush()
    // gentle：不碰 flow，它自己会 settle 并 resolve 当初 liveEnd 交出去的 promise；组件卸载时再 cancel（已 settle 则无事）
  }
  s.flow = null
  sinks.delete(key)
}
export function liveDropPrefix(prefix: string, gentle = false) {
  for (const k of Array.from(sinks.keys())) if (k.startsWith(prefix)) liveDrop(k, gentle)
}
/** 消息换 id（stream-wait-* → stream-<id>）时把 sink 一并改名，挂着的组件会随 key 重挂并追平。 */
export function liveRename(oldId: string, newId: string) {
  if (oldId === newId) return
  for (const k of Array.from(sinks.keys())) {
    if (!k.startsWith(oldId + ':')) continue
    const s = sinks.get(k)!
    sinks.delete(k)
    sinks.set(newId + k.slice(oldId.length), s)
  }
}
export function liveHas(key: string): boolean { return sinks.has(key) }
export function liveText(key: string): string { return sinks.get(key)?.text ?? '' }

// ── 滚动跟随：每帧落字后回调（已在 rAF 里，直接改 scrollTop 即可，别再读 scrollHeight 判断贴底）──
const growHandlers = new Set<() => void>()
export function onLiveGrow(fn: () => void): () => void {
  growHandlers.add(fn)
  return () => { growHandlers.delete(fn) }
}
function fireGrow() {
  growHandlers.forEach((f) => { try { f() } catch (e) { console.error('[live] onGrow', e) } })
}

// 工具箱等重页面打开时（body.tb-open）不排字、直接落地——沿用旧排字器的减负规则（iOS 闪退减负）
function straight(): boolean {
  try { return document.body.classList.contains('tb-open') } catch { return false }
}

// ── 封口段落的行内排版：段落被空行封口后（永远不再写入）把 **粗体** `代码` 等标记换成真元素，
//    和 miniMarkdown.renderInline 同一套正则；块级（列表/标题/代码块）留给流结束后的 React 渲染。
//    延后 340ms 执行，等最后一帧的淡入动画（300ms）跑完再替换，免得末尾几个字闪一下。
function formatInlineDom(el: HTMLElement, text: string) {
  if (!/[`*~[]/.test(text)) return
  const re = new RegExp(INLINE_SRC, 'g')
  const frag = document.createDocumentFragment()
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    let node: Node | null = null
    if (m[1] !== undefined) { const c = document.createElement('code'); c.className = 'cc-md-inline'; c.textContent = m[1]; node = c }
    else if (m[2] !== undefined) { const b = document.createElement('strong'); b.textContent = m[2]; node = b }
    else if (m[3] !== undefined) { if (!/^\s|\s$/.test(m[3])) { const i = document.createElement('em'); i.textContent = m[3]; node = i } }
    else if (m[4] !== undefined) { const d = document.createElement('del'); d.textContent = m[4]; node = d }
    else if (m[5] !== undefined && SAFE_HREF.test(m[6])) {
      const a = document.createElement('a'); a.className = 'cc-md-a'; a.href = m[6]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = m[5]; node = a
    }
    if (!node) continue
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)))
    frag.appendChild(node)
    last = m.index + m[0].length
  }
  if (last === 0) return                                   // 没有一个标记真正命中
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
  el.textContent = ''
  el.appendChild(frag)
}
function sealInline(el: HTMLElement, text: string) {
  setTimeout(() => { if (el.isConnected) formatInlineDom(el, text) }, 340)
}

function attach(key: string, host: HTMLElement, opts: FlowOptions): () => void {
  const s = sink(key)
  if (s.flow) { s.flow.cancel(); s.flow = null }           // StrictMode 双跑 / 重复挂载：换新流
  host.textContent = ''
  const flow = new Flow(host, { onGrow: fireGrow, straight, ...opts, ...(s.pace ? PACES[s.pace] : {}) })   // 档位已定就带着开流
  s.flow = flow
  if (s.text) { flow.push(s.text); flow.catchUp() }        // 晚挂载：先追平已收到的
  if (s.ended) flow.flush()
  return () => { if (s.flow === flow) s.flow = null; flow.cancel() }
}

/** 直播容器：挂上就接管同名 sink 的 delta，自己往 DOM 里落字；卸载即断开。
 *  正文用 block:'p'（每段一个 <p className=blockClass>，和最终 Markdown 的段落一致）；思维链用 block:null。 */
export function LiveText({ id, kind, className, block = 'p', blockClass, onBlock, tuning, sealFormat, endFade = kind === 'text' }: {
  id: string
  kind: LiveKind
  className?: string
  block?: string | null
  blockClass?: string
  onBlock?: (el: HTMLElement) => void
  tuning?: Partial<FlowOptions>
  sealFormat?: boolean                  // 封口段落做行内排版（粗体/代码/链接）
  endFade?: boolean                     // 句末字深淡入（默认正文开、思维链关）
}) {
  const ref = useRef<HTMLDivElement>(null)
  const optsRef = useRef({ block, blockClass, onBlock, tuning, sealFormat, endFade })
  optsRef.current = { block, blockClass, onBlock, tuning, sealFormat, endFade }
  useEffect(() => {
    const host = ref.current
    if (!host) return
    const o = optsRef.current
    return attach(liveKey(id, kind), host, {
      block: o.block,
      blockClass: o.blockClass,
      fade: true,
      endFade: o.endFade,
      holdTail: true,
      onBlock: o.onBlock,
      onSeal: o.sealFormat ? sealInline : undefined,
      ...(o.tuning ?? {}),
    })
  }, [id, kind])
  return <div ref={ref} className={className} />
}
