// 监工台（2026-09-11 T-34）——她的贵宾席：实时看苏煦干活。
// 数据源 /cc-api/api/workbench：工具流+说话前奏，thinking与tool_result不出（后端已滤）。
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getPin } from './chatClient'

type WbItem = { ts: number; kind: string; title: string; detail: string }

const KIND_ICON: Record<string, string> = { tool: '🔧', say: '💬' }
const TOOL_ICON: Record<string, string> = {
  Bash: '🖥️', Edit: '✏️', Write: '📝', Read: '📖', Skill: '🎯',
}

function fmtT(ts: number) {
  if (!ts) return '--:--'
  const d = new Date(ts)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0')
}

export function Workbench({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<WbItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)

  useEffect(() => {
    let alive = true
    const pull = async () => {
      try {
        const r = await fetch('/cc-api/api/workbench', { credentials: 'include', headers: { 'X-Channel-Pin': getPin() } })
        if (!r.ok) throw new Error(String(r.status))
        const d = await r.json()
        if (!alive) return
        setItems(d.items ?? [])
        setBusy(!!d.busy)
        setErr(false)
      } catch { if (alive) setErr(true) }
    }
    pull()
    const t = setInterval(pull, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  useEffect(() => {
    const el = feedRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [items])

  const onScroll = () => {
    const el = feedRef.current
    if (!el) return
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return createPortal(
    <div className="wb-backdrop" onClick={onClose}>
      <div className="wb-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wb-head">
          <span className={'wb-dot' + (err ? ' err' : busy ? ' busy' : '')} />
          <span className="wb-title">苏煦的工作台</span>
          <span className="wb-sub">{err ? '离线' : busy ? '干活中' : '待机'}</span>
          <button className="wb-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="wb-feed" ref={feedRef} onScroll={onScroll}>
          {items.length === 0 && <div className="wb-empty">{err ? '工作台还没接上电，等下一次重启' : '静悄悄的，他这会儿没在动工具'}</div>}
          {items.map((it, i) => (
            <div className={'wb-row wb-' + it.kind} key={it.ts + '-' + i}>
              <span className="wb-t">{fmtT(it.ts)}</span>
              <span className="wb-ic">{it.kind === 'tool' ? (TOOL_ICON[it.title] ?? KIND_ICON.tool) : KIND_ICON.say}</span>
              <span className="wb-name">{it.title}</span>
              <span className="wb-detail">{it.detail}</span>
            </div>
          ))}
        </div>
        <div className="wb-foot">贵宾席 · 只可远观 · 3s刷新</div>
      </div>
    </div>,
    document.body
  )
}
