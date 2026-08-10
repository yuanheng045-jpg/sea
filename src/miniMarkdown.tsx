// 极简 Markdown：零依赖、只产 React 节点(不碰 innerHTML)、单遍 O(n) 解析。
// 主聊天(CCPage)与客厅(GroupPage)共用；渲染顺序在调用方保持 附件 → 语音/音乐 → Markdown。
import { useMemo, type ReactNode } from 'react'

export type MdBlock =
  | { t: 'p'; v: string }
  | { t: 'h'; level: number; v: string }
  | { t: 'list'; ordered: boolean; start: number; items: string[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'quote'; v: string }
  | { t: 'hr' }

const FENCE_RE = /^[ \t]{0,3}```(\S*)[ \t]*$/
const H_RE = /^(#{1,4})[ \t]+(.+)$/
const UL_RE = /^[ \t]{0,3}[-*•][ \t]+(.+)$/
const OL_RE = /^[ \t]{0,3}(\d{1,3})[.)][ \t]+(.+)$/
const QUOTE_RE = /^[ \t]{0,3}>[ \t]?(.*)$/
const HR_RE = /^[ \t]{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/

// 单遍扫描，逐行判定，不做回溯型匹配；未闭合的 ``` 在流式打字途中也按代码块处理。
export function parseBlocks(src: string): MdBlock[] {
  const out: MdBlock[] = []
  if (!src) return out
  const lines = src.split('\n')
  let para: string[] = []
  const flush = () => {
    if (!para.length) return
    const v = para.join('\n')
    if (v.trim()) out.push({ t: 'p', v })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = FENCE_RE.exec(line)
    if (fence) {
      flush()
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE_RE.test(lines[i])) { body.push(lines[i]); i++ }
      out.push({ t: 'code', lang: fence[1] || '', v: body.join('\n') })
      continue
    }
    if (!line.trim()) { flush(); continue }
    if (HR_RE.test(line)) { flush(); out.push({ t: 'hr' }); continue }
    const h = H_RE.exec(line)
    if (h) { flush(); out.push({ t: 'h', level: h[1].length, v: h[2].trim() }); continue }
    const ol = OL_RE.exec(line)
    const ul = ol ? null : UL_RE.exec(line)
    if (ol || ul) {
      flush()
      const ordered = !!ol
      const items: string[] = [ordered ? ol![2] : ul![1]]
      const start = ordered ? parseInt(ol![1], 10) || 1 : 1
      while (i + 1 < lines.length) {
        const next = ordered ? OL_RE.exec(lines[i + 1]) : UL_RE.exec(lines[i + 1])
        if (!next) break
        items.push(ordered ? next[2] : next[1])
        i++
      }
      out.push({ t: 'list', ordered, start, items })
      continue
    }
    const q = QUOTE_RE.exec(line)
    if (q) {
      flush()
      const body: string[] = [q[1]]
      while (i + 1 < lines.length) {
        const next = QUOTE_RE.exec(lines[i + 1])
        if (!next) break
        body.push(next[1]); i++
      }
      out.push({ t: 'quote', v: body.join('\n') })
      continue
    }
    para.push(line)
  }
  flush()
  return out
}

// 行内标记：全部限定不跨行、内容里不含同一标记符，避免灾难性回溯。
// 注意必须每次新建 RegExp：带 g 的正则有 lastIndex 状态，递归(粗体里再解析)共用会互相踩，会打成死循环。
const INLINE_SRC = '`([^`\\n]+)`|\\*\\*([^\\n*]+)\\*\\*|\\*([^\\n*]+)\\*|~~([^\\n~]+)~~|\\[([^\\]\\n]{1,200})\\]\\(([^)\\s]{1,600})\\)'
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i

export function renderInline(text: string, keyBase = 'i'): ReactNode {
  if (!text) return text
  if (!/[`*~[]/.test(text)) return text            // 快路径：没有任何标记就原样返回
  const re = new RegExp(INLINE_SRC, 'g')
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const key = `${keyBase}-${m.index}`
    let node: ReactNode = null
    if (m[1] !== undefined) node = <code key={key} className="cc-md-inline">{m[1]}</code>
    else if (m[2] !== undefined) node = <strong key={key}>{renderInline(m[2], key)}</strong>
    else if (m[3] !== undefined) node = /^\s|\s$/.test(m[3]) ? null : <em key={key}>{m[3]}</em>
    else if (m[4] !== undefined) node = <del key={key}>{m[4]}</del>
    else if (m[5] !== undefined) {
      node = SAFE_HREF.test(m[6])
        ? <a key={key} className="cc-md-a" href={m[6]} target="_blank" rel="noopener noreferrer">{m[5]}</a>
        : null                                     // 只放行 http/https/mailto/站内路径，其余原样当文字
    }
    if (node === null) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(node)
    last = m.index + m[0].length
  }
  if (!out.length) return text
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

export function Markdown({ text, blockClass, blockRef, renderParagraph, keyBase = 'md' }: {
  text: string
  blockClass?: string                              // 主聊天传 cc-paragraph，让每块仍是一枚气泡
  blockRef?: (el: HTMLElement | null) => void      // 气泡的 IntersectionObserver 门控
  renderParagraph?: (t: string, key: string) => ReactNode  // 段落交回调用方(音乐卡等)，其余块走行内解析
  keyBase?: string
}) {
  const blocks = useMemo(() => parseBlocks(text || ''), [text])   // Hook 无条件调用
  const blockCls = blockClass ? `${blockClass} cc-md-block` : 'cc-md-block'
  const paraCls = blockClass || 'cc-md-p'
  return (
    <>
      {blocks.map((b, i) => {
        const key = `${keyBase}-${i}`
        if (b.t === 'p') {
          return (
            <p key={key} ref={blockRef} className={paraCls}>
              {renderParagraph ? renderParagraph(b.v, key) : renderInline(b.v, key)}
            </p>
          )
        }
        if (b.t === 'h') {
          return (
            <div key={key} ref={blockRef} className={blockCls}>
              <div className={`cc-md-h cc-md-h${b.level}`}>{renderInline(b.v, key)}</div>
            </div>
          )
        }
        if (b.t === 'list') {
          const items = b.items.map((it, j) => <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>)
          return (
            <div key={key} ref={blockRef} className={blockCls}>
              {b.ordered
                ? <ol className="cc-md-ol" start={b.start}>{items}</ol>
                : <ul className="cc-md-ul">{items}</ul>}
            </div>
          )
        }
        if (b.t === 'code') {
          return (
            <div key={key} ref={blockRef} className={blockCls}>
              <pre className="cc-md-pre"><code>{b.v}</code></pre>
            </div>
          )
        }
        if (b.t === 'quote') {
          return (
            <div key={key} ref={blockRef} className={blockCls}>
              <div className="cc-md-quote">{renderInline(b.v, key)}</div>
            </div>
          )
        }
        return (
          <div key={key} ref={blockRef} className={blockCls}><hr className="cc-md-hr" /></div>
        )
      })}
    </>
  )
}
