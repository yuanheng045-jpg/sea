/*!
 * weir.ts — 顺滑流式文字（TypeScript 移植，2026-09-09）
 *
 * 移植自 https://github.com/VII-Cae/weir-smoothstreaming（MIT）。三件事：
 *   1. 均速：delta 先进缓冲，requestAnimationFrame 循环按积压量算出每帧该吐几个字，
 *      显示节奏跟着屏幕刷新走，而不是跟着网络抖动走。
 *   2. 只追加：只碰正在生长的那一段；被空行封口的段落永远不再写。
 *   3. 淡入（可选 fade）：每帧新落的字包进一个短命 <span class="weir-wet">，流结束后压平成纯文本。
 *
 * 相对上游的扩展（全部可选，默认行为与上游一致）：
 *   · 每个流可单独调速：catchup / catchupEnd / minCps / maxCps
 *   · fadeMs：淡入时长，写到宿主的 CSS 变量 --weir-fade / --weir-fade-end 上
 *   · endFade（2026-09-09 苏煦的需求一·句末深淡入）：句末标点（。！？… . ! ?）且其后是空白或文本结束时，
 *     该标点与前一个字单独成一个 span、多带一个 class "weir-wet-end"，由 CSS 给更长更缓的淡入。
 *     只动透明度不动位置；单帧跳过淡入时句末也不特殊化；思维链不开这个开关。
 *   · setPace({ maxCps, fadeMs })：消息级档位；只在还没吐出任何字之前接受（一条消息一个档，严禁句中变速）
 *   · straight()：返回 true 时不排字直接落地（和隐藏标签页同一处理）
 *   · onBlock(el)：新段落元素创建时回调；onSeal(el, text)：段落被空行封口时回调
 *   · flow.catchUp()：把已收到的全部落地但不关流；flow.pushNode(node)：在当前流位置内嵌一个 DOM 节点
 *   · block:null 也支持 fade（结束时压平宿主）
 *
 * 配套 CSS（index.css）：
 *     @keyframes weir-wet { from { opacity: 0 } to { opacity: 1 } }
 *     .weir-wet { animation: weir-wet var(--weir-fade, 300ms) ease-out both; }
 *     .weir-wet-end { animation-duration: var(--weir-fade-end, 500ms); animation-timing-function: cubic-bezier(.25,1,.5,1); }
 *     @media (prefers-reduced-motion: reduce) { .weir-wet, .weir-wet-end { animation: none; } }
 */

export type FlowOptions = {
  block?: string | null                         // 段落标签；null = 不分段，一个文本节点
  blockClass?: string                           // 每个段落元素的 class
  onGrow?: () => void                           // 每帧落字后最多调一次（滚动跟随放这里）
  fade?: boolean                                // 每帧新字淡入
  fadeClass?: string                            // 淡入 span 的 class（默认 weir-wet）
  fadeMs?: number                               // 淡入时长 ms（默认 300），落到宿主 --weir-fade
  endFade?: boolean                             // 句末字深淡入（多带 endClass）
  endClass?: string                             // 句末 span 的附加 class（默认 weir-wet-end）
  holdTail?: boolean                            // 最后一帧的淡入跑完再压平并 resolve end()（末句的"沉"才看得见）
  endPause?: number                             // 句末标点后的呼吸停顿 ms（默认 0 = 关）
  clausePause?: number                          // 逗号顿号等后的小停顿 ms（默认 0 = 关）
  straight?: () => boolean                      // true = 直接落地不排字
  onBlock?: (el: HTMLElement) => void           // 新段落元素创建
  onSeal?: (el: HTMLElement, text: string) => void  // 段落封口（此后不再写入）
  catchup?: number                              // 流中：多少秒内追平积压（= 显示落后网络的量）
  catchupEnd?: number                           // end() 之后：收尾追平窗口
  minCps?: number                               // 最低字/秒
  maxCps?: number                               // 最高字/秒
  doc?: Document
}

export type Pace = { maxCps?: number; fadeMs?: number; endPause?: number; clausePause?: number }

const DEFAULTS = { catchup: 0.30, catchupEnd: 0.09, minCps: 8, maxCps: 1400, fadeMs: 300 }
const JUMP_DT = 0.35      // 一帧超过这么久 = 卡顿/刚从后台回来：这一帧不淡入、不带余额
const MAX_DT = 2          // 卡顿帧最多按这么多秒的速率结算——绝不"整段倒出来"（限速模式下积压就是正文）
const WATCHDOG_MS = 250   // 可见却迟迟没有 rAF 帧的环境：退化为直接落地
const FADE_MAX = 48       // 一帧超过这么多字就不淡入：整块一起亮是闪，不是淡
const END_PUNCT = /[。！？…!?.]/   // 句末标点（endFade / endPause）
const CLAUSE_PUNCT = /[，、；：]/   // 句中标点（clausePause）；ASCII ,;: 只在后面是空白时算
const END_HOLD_MS = 150   // 句末标点后面的字还没到时，最多等这么久再放
const END_FADE_RATIO = 5 / 3   // 句末淡入 = 普通淡入 × 此（300ms → 500ms）

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const num = (v: number | undefined, d: number) => (typeof v === 'number' && v > 0 ? v : d)
const hasCls = (node: Node, cls: string) => {
  const c = (node as Element).className
  return typeof c === 'string' && c !== '' && (' ' + c + ' ').indexOf(' ' + cls + ' ') !== -1
}
const isSpace = (ch: string) => /\s/.test(ch)
const highSurrogate = (code: number) => code >= 0xD800 && code <= 0xDBFF
/* 必须和 rAF 传入的时间戳同源，否则 dt 是垃圾 */
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())
/* 后台标签页浏览器不跑 rAF：没人看，就直接写进去，别让 end() 一直挂着 */
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

const liveFlows = new Set<Flow>()
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (hidden()) for (const f of Array.from(liveFlows)) f.catchUp()
  })
}

type InlineNode = { at: number; node: Node }
type Mask = number[] | null

export class Flow {
  host: HTMLElement
  doc: Document
  block: string | null
  blockClass: string
  onGrow: (() => void) | null
  onBlock: ((el: HTMLElement) => void) | null
  onSeal: ((el: HTMLElement, text: string) => void) | null
  straight: (() => boolean) | null
  fade: boolean
  fadeClass: string
  endFade: boolean
  endClass: string
  fadeMs: number
  holdTail: boolean
  endPause: number
  clausePause: number
  tune: { catchup: number; catchupEnd: number; minCps: number; maxCps: number }

  text = ''          // 收到的全部，不管落没落
  shown = 0          // 已落进 DOM 的长度
  ended = false      // 上游结束
  dead = false       // 被 cancel
  drained: Promise<void>

  private _hold = ''                       // 暂扣的尾部换行：是段落分隔还是段内换行，下一片才知道
  private _holdSince = 0                   // endFade：从什么时候开始等句末标点后面的那个字
  private _pauseUntil = 0                  // 呼吸停顿：这个时间戳之前不吐字、不攒余额
  private _block: HTMLElement | null = null
  private _blockText = ''                  // 当前段落已落的文字（交给 onSeal）
  private _tail: Text | null = null        // 正在追加的文本节点
  private _wet = false                     // 出过淡入 span，收尾要压平
  private _nodes: InlineNode[] = []        // 等待流到达其位置的内嵌节点
  private _hasNodes = false
  private _credit = 0                      // 速率的小数余额
  private _raf = 0
  private _guard: ReturnType<typeof setTimeout> | 0 = 0
  private _last = 0
  private _settled = false
  private _resolve: (() => void) | null = null

  constructor(host: HTMLElement, opts?: FlowOptions) {
    const o = opts ?? {}
    this.host = host
    this.doc = o.doc ?? document
    this.block = o.block === undefined ? 'p' : o.block
    this.blockClass = o.blockClass ?? ''
    this.onGrow = o.onGrow ?? null
    this.onBlock = o.onBlock ?? null
    this.onSeal = o.onSeal ?? null
    this.straight = o.straight ?? null
    this.fade = !!o.fade
    this.fadeClass = o.fadeClass ?? 'weir-wet'
    this.endFade = this.fade && !!o.endFade
    this.endClass = o.endClass ?? (this.fadeClass + '-end')
    this.fadeMs = num(o.fadeMs, DEFAULTS.fadeMs)
    this.holdTail = !!o.holdTail
    this.endPause = Math.max(0, o.endPause ?? 0)
    this.clausePause = Math.max(0, o.clausePause ?? 0)
    this.tune = {
      catchup: num(o.catchup, DEFAULTS.catchup),
      catchupEnd: num(o.catchupEnd, DEFAULTS.catchupEnd),
      minCps: num(o.minCps, DEFAULTS.minCps),
      maxCps: num(o.maxCps, DEFAULTS.maxCps),
    }
    this.drained = new Promise<void>((r) => { this._resolve = r })
    this._applyFadeVars()
    liveFlows.add(this)
  }

  /** 喂一个 delta。只进缓冲——除非没人在看页面。 */
  push(t: string) {
    if (this.dead || this.ended || !t) return
    this.text += t
    this._holdSince = 0                    // 前沿动了：扣住的句末可以判定了
    if (this._writeThrough()) this._catchUp()
    else this._kick()
  }

  /** 在流当前到达的位置内嵌一个 DOM 节点（工具卡片之类）。 */
  pushNode(node: Node) {
    if (this.dead || this.ended || !node) return
    this._nodes.push({ at: this.text.length, node })
    this._hasNodes = true
    if (this._writeThrough()) this._catchUp()
    else this._kick()
  }

  /** 消息级档位：字速上限 + 淡入时长。一条消息一个档——已经吐出字之后一律拒绝，绝不句中变速。 */
  setPace(pace: Pace | null | undefined): boolean {
    if (!pace || this.dead || this._settled || this.shown > 0) return false
    if (num(pace.maxCps, 0)) this.tune.maxCps = pace.maxCps as number
    if (num(pace.fadeMs, 0)) { this.fadeMs = pace.fadeMs as number; this._applyFadeVars() }
    if (typeof pace.endPause === 'number') this.endPause = Math.max(0, pace.endPause)
    if (typeof pace.clausePause === 'number') this.clausePause = Math.max(0, pace.clausePause)
    return true
  }

  /** 上游结束。返回的 promise 在 DOM 完整时才 resolve——"完成后的重渲染"要 await 它，
   *  否则还在缓冲里的尾巴会一口气倒出来，均速就白做了。 */
  end(): Promise<void> {
    if (!this.dead && !this.ended) {
      this.ended = true
      if (this._writeThrough()) this._catchUp()
      if (this._done()) this._settle()
      else this._kick()
    }
    return this.drained
  }

  /** 立刻落地已收到的全部，但不关流（思维链让路、隐藏标签页）。 */
  catchUp() { this._catchUp() }

  /** 停止动画、把剩余立刻写完并关流（切视图、卸载）。 */
  flush() {
    if (this.dead) return
    if (!this._done()) this._landAll()
    this.ended = true
    this._settle()
  }

  /** 丢掉剩余并停止。已落地的原样留着。 */
  cancel() {
    this.dead = true
    this._settle()
  }

  // ---- 内部 ----

  private _writeThrough() { return hidden() || (this.straight ? !!this.straight() : false) }
  private _done() { return this.shown >= this.text.length && this._nodes.length === 0 }

  private _applyFadeVars() {
    const st = this.host && this.host.style
    if (!st || typeof st.setProperty !== 'function') return
    st.setProperty('--weir-fade', this.fadeMs + 'ms')
    st.setProperty('--weir-fade-end', Math.round(this.fadeMs * END_FADE_RATIO) + 'ms')
  }

  private _catchUp() {
    if (this.dead || this._settled) return
    this._clearGuard()
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
    this._credit = 0
    if (!this._done()) {
      this._landAll()               // 没人看，不淡入
      if (this.onGrow) this.onGrow()
    }
  }

  /* 把剩余全部写掉，内嵌节点按各自位置落。 */
  private _landAll() {
    for (;;) {
      this._placeNodes()
      if (this.shown >= this.text.length) break
      const upto = this._nodes.length ? Math.min(this._nodes[0].at, this.text.length) : this.text.length
      this._write(this.text.slice(this.shown, upto), false, false, null)
      this.shown = upto
    }
  }

  /* 流已到达其位置的内嵌节点现在进 DOM。 */
  private _placeNodes() {
    while (this._nodes.length && this._nodes[0].at <= this.shown) {
      const item = this._nodes.shift()!
      if (this._hold) { const h = this._hold; this._hold = ''; this._write(h, false, true, null) }
      const box = this._blockNode()
      box.appendChild(item.node)
      this._tail = null              // 后面的字必须落在节点之后
    }
  }

  /* 重启时钟：记真实时间戳而不是清零。清零会让下一帧按 1/60s 计费，
   * 速率变成"实际帧率 ÷ 60 × 目标速率"——60fps 下刚好正确所以藏得很深，
   * 掉到 10fps 文字就爬到六分之一速度。 */
  private _kick() {
    if (this._raf || this.dead || this._settled) return
    this._last = nowMs()
    this._credit = 0
    this._schedule()
    if (!this._guard) {
      this._guard = setTimeout(() => { this._guard = 0; this._catchUp() }, WATCHDOG_MS)
    }
  }

  private _clearGuard() {
    if (this._guard) clearTimeout(this._guard)
    this._guard = 0
  }

  private _schedule() {
    this._raf = requestAnimationFrame((ts) => this._frame(ts))
  }

  private _frame(ts: number) {
    this._raf = 0
    this._clearGuard()      // 有帧来了：这个环境会动画
    if (this.dead || this._settled) return

    if (this._writeThrough()) {
      // 动画途中开了重页面（或标签页藏起来）：剩余直接落地
      if (!this._done()) { this._landAll(); if (this.onGrow) this.onGrow() }
      if (this.ended) this._settle(); else this._credit = 0
      return
    }

    const dt = Math.max(0, ts - this._last) / 1000
    this._last = ts
    if (ts < this._pauseUntil) { this._schedule(); return }   // 呼吸停顿：不吐字，也不攒余额
    const pend = this.text.length - this.shown

    // 卡顿帧（切标签页回来、主线程打嗝）按这段时间的速率结算：不淡入、不带余额，
    // 但绝不把积压整段倒出来——限速模式下积压就是正文，倒出来均速就白做了。
    const t = this.tune
    const cps = clamp(pend / (this.ended ? t.catchupEnd : t.catchup), t.minCps, t.maxCps)
    this._credit += cps * Math.min(dt, MAX_DT)
    let n = Math.min(Math.floor(this._credit), pend)
    this._credit -= n
    const jump = dt > JUMP_DT
    if (jump) this._credit = 0

    if (n > 0) {
      const fade = this.fade && !jump && n <= FADE_MAX
      const endFade = fade && this.endFade
      let budget = n
      let grew = false
      while (budget > 0 && this.shown < this.text.length) {
        this._placeNodes()
        const limit = this._nodes.length ? this._nodes[0].at : this.text.length
        let end = Math.min(this.shown + budget, limit)
        if (end <= this.shown) break
        // 代理对（emoji）不能从中间切：淡入模式下每帧是独立文本节点
        if (end < limit && highSurrogate(this.text.charCodeAt(end - 1))) end++
        if (endFade) {
          const cut = this._endCut(this.shown, end, limit, ts)
          this._credit += end - cut            // 扣住的字把额度还回去
          if (cut <= this.shown) break         // 整片都在等下一个字
          end = cut
        }
        const pause = (this.endPause || this.clausePause) ? this._pausePoint(this.shown, end) : null
        if (pause && pause.at < end) end = pause.at    // 吐到标点为止，喘一口，下一帧再继续
        const slice = this.text.slice(this.shown, end)
        this._write(slice, fade, false, endFade ? this._endMask(this.shown, end) : null)
        budget -= end - this.shown
        this.shown = end
        grew = true
        if (pause && pause.at === end) { this._pauseUntil = ts + pause.ms; this._credit = 0; break }
      }
      if (this._credit < 0) this._credit = 0
      this._placeNodes()
      if (grew && this.onGrow) this.onGrow()
    } else {
      this._placeNodes()
    }

    if (!this._done()) { this._schedule(); return }
    if (this.ended) this._settle()
    else this._credit = 0        // 池子空了：停循环，下次 push 再启
  }

  /* endFade：调整本帧切片的终点——句末对（标点 + 前一个字）绝不跨帧拆开；
   * 尾部标点后面的字还没到时先扣住，等它到了（或超过 END_HOLD_MS）再放。 */
  private _endCut(start: number, end: number, limit: number, now: number): number {
    const text = this.text, len = text.length
    const isP = (i: number) => END_PUNCT.test(text[i])
    let p = end - 1
    if (!isP(p) && p + 1 < len && p + 1 < limit && isP(p + 1)) { end = p + 2; p = end - 1 }   // 把标点拉进来
    if (isP(p)) {
      if (p + 1 < len || this.ended) return end                 // 后面的字已知，或文本结束 = 段落结束
      if (this._holdExpired(now)) return end
      return Math.max(start, end - 2)                            // 扣住标点和它前面那个字
    }
    if (p + 1 === len && !this.ended) {                           // 下一个字还在路上
      if (this._holdExpired(now)) return end
      return Math.max(start, end - 1)
    }
    return end
  }

  private _holdExpired(now: number): boolean {
    if (!this._holdSince) { this._holdSince = now; return false }
    return now - this._holdSince > END_HOLD_MS
  }

  /* endPause / clausePause：text[start, end) 里第一个值得喘口气的标点，返回 { at: 标点之后的下标, ms }。
   * "……""！！"这类连着的只喘一次（在最后一个之后）；ASCII , ; : 只在后面是空白时算（"1,000"、网址不结巴）。 */
  private _pausePoint(start: number, end: number): { at: number; ms: number } | null {
    const text = this.text, len = text.length
    for (let i = start; i < end; i++) {
      const ch = text[i]
      const next = i + 1 < len ? text[i + 1] : ''
      if (this.endPause && END_PUNCT.test(ch)) {
        if (next && END_PUNCT.test(next)) continue
        if (next ? isSpace(next) : this.ended) return { at: i + 1, ms: this.endPause }
        continue
      }
      if (this.clausePause && (CLAUSE_PUNCT.test(ch) || (/[,;:]/.test(ch) && !!next && isSpace(next)))) {
        return { at: i + 1, ms: this.clausePause }
      }
    }
    return null
  }

  /* endFade：text[start, end) 中句末字标 1，其余 0。 */
  private _endMask(start: number, end: number): number[] {
    const text = this.text, len = text.length
    const mask: number[] = new Array(end - start).fill(0)
    for (let i = start; i < end; i++) {
      if (!END_PUNCT.test(text[i])) continue
      const isEnd = i + 1 < len ? isSpace(text[i + 1]) : this.ended
      if (!isEnd) continue
      mask[i - start] = 1
      if (i - 1 >= start) mask[i - 1 - start] = 1
    }
    return mask
  }

  /** 落一片文字。空行分段；单个换行留在段内交给 CSS(white-space)。release=true 不暂扣尾部换行。
   *  mask（可选）标出 s 中的句末字，给深淡入。 */
  private _write(s: string, fade: boolean, release: boolean, mask: Mask) {
    const off = this._hold.length
    let t = this._hold + s
    this._hold = ''
    const mk = mask
      ? (a: number, b: number): Mask => { const m: number[] = []; for (let k = a; k < b; k++) m.push(k >= off ? (mask[k - off] || 0) : 0); return m }
      : (): Mask => null
    if (!this.block) {
      if (t) this._emit(t, fade, mk(0, t.length))
      return
    }
    if (!release) {
      // 尾部换行先扣住——只有下一片才能揭晓它是段落分隔还是段内换行
      const m = /\n+$/.exec(t)
      if (m) { this._hold = m[0]; t = t.slice(0, t.length - m[0].length) }
    }
    const re = /\n{2,}/g
    let pos = 0, idx = 0
    let m2: RegExpExecArray | null
    while ((m2 = re.exec(t)) !== null) {
      if (idx > 0) this._seal()
      const seg = t.slice(pos, m2.index)
      if (seg) this._emit(seg, fade, mk(pos, m2.index))
      pos = m2.index + m2[0].length
      idx++
    }
    if (idx > 0) this._seal()
    const tail = t.slice(pos)
    if (tail) this._emit(tail, fade, mk(pos, t.length))
  }

  /* 封口：这一段从此不再碰。 */
  private _seal() {
    const el = this._block
    const text = this._blockText
    this._block = null
    this._tail = null
    this._blockText = ''
    if (el && this.onSeal) this.onSeal(el, text)
  }

  /** 落一小把字。淡入：每帧一个新 span（句末字单独一个 span、多带 endClass），CSS 动画跑一次就停；
   *  否则：appendData 到现有文本节点——DOM 提供的最便宜的写法。 */
  private _emit(s: string, fade: boolean, mask: Mask) {
    const box = this._blockNode()
    this._blockText += s
    if (fade) {
      let i = 0
      while (i < s.length) {
        const endRun = !!(mask && mask[i])
        let j = i + 1
        while (j < s.length && !!(mask && mask[j]) === endRun) j++
        const w = this.doc.createElement('span')
        w.className = endRun ? this.fadeClass + ' ' + this.endClass : this.fadeClass
        const t = this.doc.createTextNode('')
        t.appendData(s.slice(i, j))
        w.appendChild(t)
        box.appendChild(w)
        i = j
      }
      this._tail = null        // 下一把不能并进这个 span：它有自己的动画
      this._wet = true
      return
    }
    if (!this._tail) {
      this._tail = this.doc.createTextNode('')
      box.appendChild(this._tail)
    }
    this._tail.appendData(s)
  }

  private _blockNode(): HTMLElement {
    if (!this.block) return this.host
    if (!this._block) {
      const el = this.doc.createElement(this.block)
      if (this.blockClass) el.className = this.blockClass
      this.host.appendChild(el)
      this._block = el
      this._tail = null
      this._blockText = ''
      if (this.onBlock) this.onBlock(el)
    }
    return this._block
  }

  /** 流结束后把淡入 span 压回纯文本：缓存过的 innerHTML 再插回来不会整段重播动画，
   *  DOM 也回到最简形态。已不带 span 的段落（比如 onSeal 重排过的）不动。 */
  private _solidify() {
    if (!this._wet || this.dead) return
    this._wet = false
    const cls = this.fadeClass
    const wet = (el: Node) => Array.from(el.childNodes).some((c) => hasCls(c, cls))
    if (this.block) {
      const blocks = Array.from(this.host.childNodes).filter((c) => !!(c as Element).tagName) as HTMLElement[]
      for (const b of blocks) if (wet(b)) b.textContent = b.textContent
    } else if (!this._hasNodes) {
      if (wet(this.host)) this.host.textContent = this.host.textContent
    } else {
      const kids = Array.from(this.host.childNodes)
      for (const k of kids) {
        if (!hasCls(k, cls)) continue
        const t = this.doc.createTextNode('')
        t.appendData(k.textContent ?? '')
        this.host.replaceChild(t, k)
      }
    }
    this._tail = null
    this._block = null
  }

  private _settle() {
    if (this._settled) return
    this._settled = true
    this._clearGuard()
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
    this._hold = ''          // 尾部空行不该留下一个空段落
    this._nodes = []
    liveFlows.delete(this)
    const finish = () => {
      this._solidify()
      const r = this._resolve
      this._resolve = null
      if (r) r()
    }
    // holdTail：最后一帧落下的字还在淡入，此刻就压平（调用方随即换最终渲染）会让它们瞬间全亮——
    // 最该"沉"的末句反而永远沉不下去。等淡入跑完再收。
    if (this.holdTail && this._wet && !this.dead) {
      setTimeout(finish, Math.round(this.fadeMs * END_FADE_RATIO) + 40)
    } else finish()
  }
}

export function open(host: HTMLElement, opts?: FlowOptions): Flow { return new Flow(host, opts) }
