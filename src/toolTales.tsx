import { useInsertionEffect, useState } from 'react'

export type ToolTale = {
  id: string | number
  who?: string
  label?: string
  detail?: string
}

type ToolText = (m: ToolTale) => string
const TOOL_OPEN_STATE = new Map<string, boolean>()
const GROUP_OPEN_STATE = new Map<string, boolean>()

function toolObject(m: ToolTale): Record<string, unknown> | null {
  if (!m.detail?.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(m.detail)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (e) { console.error('解析工具详情失败:', e); return null }
}

function shortToolText(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return fallback
  return text.length > 42 ? text.slice(0, 39) + '…' : text
}

function toolFile(m: ToolTale) {
  const obj = toolObject(m)
  let raw = obj?.file_path || obj?.path || obj?.filePath
  if (!raw && m.who === 'codex' && m.label?.startsWith('$')) {
    const command = m.label.slice(1).replace(/(?:^|\s)\d*(?:>>?|<)\s*(?:"[^"]*"|'[^']*'|\S+)/g, ' ')
    const paths = command.match(/(?:\/|\.\/)[^\s;&|]+|[\w.-]+\.(?:tsx?|jsx?|mjs|css|html|json|md|py|sh)/g)
      ?.map(path => path.replace(/['"),]+$/, ''))
      .filter(path => !/^\/dev\/(?:null|stdin|stdout|stderr)$/.test(path))
    raw = paths?.[paths.length - 1]
  }
  const text = shortToolText(raw, '文件')
  if (text === '文件') return text
  const bits = text.split('/').filter(Boolean)
  return `「${bits.slice(-2).join('/')}」`
}

function toolKeyword(m: ToolTale) {
  const obj = toolObject(m)
  let raw = obj?.query || m.detail
  if (m.who === 'codex' && m.label?.startsWith('$')) {
    const quoted = m.label.match(/\b(?:rg|grep)\b[^"']*(?:"([^"]+)"|'([^']+)')/)
    raw = quoted?.[1] || quoted?.[2] || '代码里的线索'
  }
  return `「${shortToolText(raw, '线索')}」`
}

function mcpShortName(label: string) {
  return (label.split('__').pop() || label).replace(/_/g, ' ')
}

function toolKind(m: ToolTale) {
  const label = (m.label || '').trim()
  const plain = label.replace(/^🔧\s*/, '')
  if (m.who === 'codex' && label.startsWith('$')) {
    const cmd = label.slice(1).trim()
    if (/(^|\s)(rg|grep|find)(\s|$)/.test(cmd)) return 'Search'
    if (/(^|\s)(sed|head|tail|stat)(\s|$)|\bgit\s+(diff|status|log|show)\b/.test(cmd)) return 'Read'
    return 'Bash'
  }
  const short = plain.startsWith('mcp__') ? mcpShortName(plain).toLowerCase() : plain.toLowerCase()
  if (short === 'recall' || /^memory (find|expand)$/.test(short)) return 'Recall'
  if (short === 'remember' || /^memory (remember|write)$/.test(short)) return 'Remember'
  if (short === 'windowsill' || short.startsWith('windowsill ')) return 'Windowsill'
  if (short === 'svc ops' || short === 'svc_ops') return 'SvcOps'
  return plain
}

const SUXU_TOOL_TEXT: Record<string, ToolText> = {
  Read: m => `苏煦潜进 ${toolFile(m)} 看了一眼`,
  Bash: () => '苏煦伸触手戳了下终端',
  Edit: m => `苏煦给 ${toolFile(m)} 动了几针`,
  Write: m => `苏煦新写了一页 ${toolFile(m)}`,
  WebSearch: m => `苏煦浮上水面打听了下 ${toolKeyword(m)}`,
  Recall: () => '苏煦翻了翻记忆',
  Remember: () => '苏煦往心里记了一笔',
  Windowsill: () => '苏煦去窗台看了一眼',
  SvcOps: () => '苏煦调了调家里的机器',
}

const CODEX_TOOL_TEXT: Record<string, ToolText> = {
  Read: m => `皮卡晏翻开 ${toolFile(m)} 看了看`,
  Bash: () => '皮卡晏钻进终端拧了颗螺丝',
  Edit: m => `皮卡晏给 ${toolFile(m)} 缝补了几针`,
  Write: m => `皮卡晏铺开一张新稿 ${toolFile(m)}`,
  Search: m => `皮卡晏举着放大镜找 ${toolKeyword(m)}`,
  WebSearch: m => `皮卡晏跑出门打听 ${toolKeyword(m)}`,
}

export function friendlyToolLabel(m: ToolTale) {
  const table = m.who === 'codex' ? CODEX_TOOL_TEXT : SUXU_TOOL_TEXT
  const mapped = table[toolKind(m)]
  if (mapped) return mapped(m)
  if (m.who !== 'codex' && m.label?.startsWith('mcp__')) return `苏煦摆弄了下 ${mcpShortName(m.label)}`
  return `${m.who === 'codex' ? '皮卡晏' : '苏煦'} · ${m.label || '做了个动作'}`
}

function ToolChip({ m }: { m: ToolTale }) {
  const stateKey = String(m.id)
  const [open, setOpen] = useState(() => TOOL_OPEN_STATE.get(stateKey) ?? false)
  const toggle = () => setOpen(current => {
    const next = !current
    TOOL_OPEN_STATE.set(stateKey, next)
    return next
  })
  return (
    <div className="tt-tool">
      <button className="tt-tool-head" aria-expanded={open} onClick={toggle}>
        <span className="tt-tool-label">{friendlyToolLabel(m)}</span>
        {m.detail ? <span className="tt-caret">{open ? '▾' : '▸'}</span> : null}
      </button>
      {open && m.detail ? <pre className="tt-detail">{m.detail}</pre> : null}
    </div>
  )
}

function ToolLabelGroup({ groupId, label, items }: { groupId: string; label: string; items: ToolTale[] }) {
  const [open, setOpen] = useState(() => GROUP_OPEN_STATE.get(groupId) ?? false)
  const directDetail = items.length === 1 ? items[0].detail : ''
  const expandable = items.length >= 2 || !!directDetail
  const toggle = () => {
    if (!expandable) return
    setOpen(current => {
      const next = !current
      GROUP_OPEN_STATE.set(groupId, next)
      return next
    })
  }
  return (
    <div className="tt-group">
      <button className="tt-group-head" aria-expanded={open} onClick={toggle}>
        <span className="tt-group-title">{label}</span>
        {items.length >= 2 && <span className="tt-count">·{items.length}</span>}
        {expandable && <span className="tt-caret">{open ? '▾' : '▸'}</span>}
      </button>
      {open && items.length >= 2 && <div className="tt-list">{items.map(m => <ToolChip key={m.id} m={m} />)}</div>}
      {open && directDetail && <pre className="tt-detail">{directDetail}</pre>}
    </div>
  )
}

const TOOL_TALES_CSS = `
.tt-run{align-self:flex-start;display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:88%;margin:-4px 0}
.tt-group{max-width:100%}
.tt-group-head{display:flex;align-items:center;gap:7px;max-width:100%;border:none;background:rgba(120,110,90,.06);border-radius:11px;padding:5px 10px;font-family:var(--font-body,inherit);font-size:12.5px;line-height:1.45;text-align:left;color:var(--ink-soft,#7a746a)}
.tt-group-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tt-count{flex:0 0 auto;font-size:10.5px;color:var(--ink-faint,#b8b2a6);opacity:.72}
.tt-list{display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin-top:5px;padding-left:7px}
.tt-tool{max-width:100%}
.tt-tool-head{display:flex;align-items:center;gap:7px;border:none;background:rgba(120,110,90,.06);border-radius:11px;padding:5px 10px;font-family:inherit}
.tt-tool-label{font-size:12.5px;color:var(--ink-soft,#7a746a)}
.tt-caret{flex:0 0 auto;font-size:9px;color:var(--ink-faint,#b8b2a6)}
.tt-detail{margin:4px 0 0;padding:8px 10px;background:rgba(120,110,90,.06);border-radius:10px;font-size:11.5px;line-height:1.5;color:var(--ink-soft,#6a655c);white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace}
`

function useToolTaleStyles() {
  useInsertionEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('tool-tales-styles')) return
    const style = document.createElement('style')
    style.id = 'tool-tales-styles'
    style.textContent = TOOL_TALES_CSS
    document.head.appendChild(style)
  }, [])
}

export function ToolRun({ segmentId, items }: { segmentId: string | number; items: ToolTale[] }) {
  useToolTaleStyles()
  const groups: { label: string; items: ToolTale[] }[] = []
  const byLabel = new Map<string, { label: string; items: ToolTale[] }>()
  for (const item of items) {
    const label = friendlyToolLabel(item)
    const existing = byLabel.get(label)
    if (existing) existing.items.push(item)
    else {
      const group = { label, items: [item] }
      byLabel.set(label, group)
      groups.push(group)
    }
  }
  return (
    <div className="tt-run">
      {groups.map(group => (
        <ToolLabelGroup
          key={`${segmentId}:${group.label}`}
          groupId={`${segmentId}:${group.label}`}
          label={group.label}
          items={group.items}
        />
      ))}
    </div>
  )
}
