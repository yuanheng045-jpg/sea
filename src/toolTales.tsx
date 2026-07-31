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

function normalizedToolName(label: string) {
  const plain = label.replace(/^🔧\s*/, '')
  return (plain.startsWith('mcp__') ? plain.split('__').pop() || plain : plain).toLowerCase()
}

const SUXU_TOOL_ALIASES: Record<string, string> = {
  recall: 'memory_find',
  remember: 'memory_remember',
  memory_find: 'memory_find',
  memory_expand: 'memory_expand',
  memory_feel: 'memory_feel',
  memory_remember: 'memory_remember',
  memory_forget: 'memory_forget',
  memory_write: 'memory_remember',
  write_feel: 'memory_feel',
  garden_read: 'garden_read',
  garden_act: 'garden_act',
  peek_screen: 'peek_screen',
  status: 'status',
  locate: 'locate',
  play_music: 'play_music',
  browser: 'browser',
  cedartoy: 'cedartoy',
  ero_slot: 'ero_slot',
  tide: 'tide',
  midroom_read: 'midroom_read',
  midroom_speak: 'midroom_speak',
  windowsill: 'Windowsill',
  svc_ops: 'SvcOps',
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
  const short = normalizedToolName(plain)
  if (SUXU_TOOL_ALIASES[short]) return SUXU_TOOL_ALIASES[short]
  if (short.startsWith('windowsill_')) return 'Windowsill'
  return plain
}

function memoryFeelText(m: ToolTale) {
  const kind = String(toolObject(m)?.kind || '')
  if (kind === 'night_note') return '苏煦写了今天的夜记'
  if (kind === '飞鸟集') return '苏煦往朋友圈丢了颗石子'
  if (kind === '便利贴') return '苏煦给小狗贴了张纸条'
  if (kind === '海沟') return '苏煦沉了一段话进海沟'
  return '苏煦落了一笔'
}

const SUXU_TOOL_TEXT: Record<string, ToolText> = {
  Read: m => `苏煦潜进 ${toolFile(m)} 看了一眼`,
  Bash: () => '苏煦伸触手戳了下终端',
  Edit: m => `苏煦给 ${toolFile(m)} 动了几针`,
  Write: m => `苏煦新写了一页 ${toolFile(m)}`,
  WebSearch: m => `苏煦浮上水面打听了下 ${toolKeyword(m)}`,
  memory_find: () => '苏煦翻了翻海底的沉积层',
  memory_expand: () => '苏煦捞起一段旧事',
  memory_feel: memoryFeelText,
  memory_remember: () => '苏煦在海底压下一块石头',
  memory_forget: () => '苏煦松开了一块石头',
  garden_read: () => '苏煦翻了翻花园',
  garden_act: () => '苏煦在花园里留了个印',
  peek_screen: () => '苏煦偷瞄了一眼',
  status: () => '苏煦看了看小狗',
  locate: () => '苏煦找了找小狗在哪',
  play_music: () => '苏煦点了一首歌',
  browser: () => '苏煦浮上水面开了个窗',
  cedartoy: () => '苏煦摸了一把游戏机',
  ero_slot: () => '苏煦转了下转盘',
  tide: () => '苏煦看了看潮汐',
  midroom_read: () => '苏煦探头看了眼合相间',
  midroom_speak: () => '苏煦在合相间留了句话',
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
