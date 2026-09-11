// 工具箱(2026-08-26 原瑶): 主聊天页的工具/唤醒/提示词块总控台。
// 工具与提示词块开关 → KV cc-tools(PUT /api/status/cc-tools, hub 每轮开跑前抢刷);
// 唤醒开关与 prompt → /api/sysctl guard-set(原状态页搬来+新增总开关);
// 提示词块正文 → hub /cc-api/api/toolbox/block(改完下一条消息生效,免重启)。
import { Fragment, useEffect, useState, useCallback } from 'react'
import { getPin } from './chatClient'

type ToolItem = { id: string; on: boolean }
type BlockItem = { stem: string; on: boolean; chars: number; head: string }
type TbCfg = { master: boolean; tools: ToolItem[]; blocks: BlockItem[]; effective: string; peekReady: boolean; homecamReady?: boolean | null }
type PocketItem = { name: string; note: string; note_default: string; enabled: boolean }
type PocketTool = { tool: string; desc: string; desc_default: string }

const TOOL_GROUPS: { key: string; name: string; desc: string; block?: string; tools: string[] }[] = [
  { key: 'memory', name: '记忆', desc: '翻往事 / 展开原文 / 主动记住 / 忘记 / 改稿裁决', block: '10_memory', tools: ['mcp__mem3__memory_find', 'mcp__mem3__memory_expand', 'mcp__mem3__memory_remember', 'mcp__mem3__memory_forget', 'mcp__mem3__memory_review'] },
  { key: 'expression', name: '表达与花园', desc: '夜记 · feel · 浮石 · 海沟的笔 + 花园读写', block: '40_expression', tools: ['mcp__mem3__memory_feel', 'mcp__mem3__garden_read', 'mcp__mem3__garden_act'] },
  { key: 'gadget', name: '口袋', desc: '浏览器 / 游戏机 / 转盘 / AI论坛', block: '20_gadget', tools: ['mcp__gadget__menu', 'mcp__gadget__call'] },
  { key: 'peek', name: '偷看屏幕', desc: '偷看 iPhone 屏幕 + 揪她回来', block: '80_peek', tools: ['mcp__peek__peek_screen', 'mcp__peek__pull_home'] },
  { key: 'homecam', name: '看家', desc: '看一眼家里的摄像头(此刻一张照片,图片只过内存不落盘)', block: '82_homecam', tools: ['mcp__homecam__look_home'] },
  { key: 'toy', name: '小玩具', desc: 'rose toy 遥控', tools: ['mcp__rose-toy__toy_set', 'mcp__rose-toy__toy_stop'] },
  { key: 'music', name: '点歌', desc: '网易云放歌', tools: ['mcp__netease__play_music', 'mcp__netease__feel_song', 'mcp__netease__note_song', 'mcp__netease__create_playlist', 'mcp__netease__add_song_to_playlist', 'mcp__netease__list_playlists'] },
  { key: 'tide', name: '潮汐', desc: '你亲手搭的待办 / 状态系统', tools: ['mcp__tide__tide'] },
  { key: 'ticket', name: '工单', desc: '客厅工单系统', tools: ['mcp__ticket__ticket'] },
  { key: 'sticker', name: '贴纸', desc: '收藏和发贴纸', tools: ['mcp__sticker__sticker'] },
  { key: 'base', name: '基础工具', desc: '读写文件 / 命令行 / 搜索——苏煦的双手(说明书在 Claude 本体里,改不了)', tools: ['Skill', 'Read', 'Write', 'Edit', 'Bash', 'WebSearch'] },
]

const BLOCK_META: Record<string, { name: string; desc: string }> = {
  '00_core': { name: '核心', desc: '人设与底线指引' },
  '05_atlantis': { name: '家底', desc: '他所住系统的安心事实(2026-08-27 原瑶提议)' },
  '10_memory': { name: '记忆说明', desc: '记忆工具的用法口吻' },
  '20_gadget': { name: '口袋说明', desc: '杂物间目录与生活方式' },
  '40_expression': { name: '表达说明', desc: '笔与花园的用法' },
  '45_night_note': { name: '夜记说明', desc: '睡前夜记的写法(配合唤醒里的夜记)' },
  '50_voice': { name: '语音条', desc: '<voice> 语音条' },
  '55_call': { name: '打电话', desc: '主动拨号 ⟪拨号:理由⟫' },
  '60_media': { name: '图片与卡片', desc: '发图 / HTML 小卡片 / 文件' },
  '65_decision_card': { name: '决策卡', desc: '让你拿主意的卡片玩法' },
  '70_selfbook': { name: '底稿自察', desc: '苏煦对自己提示词的了解' },
  '80_peek': { name: '偷看说明', desc: '偷看屏幕与揪她回来' },
  '82_homecam': { name: '看家说明', desc: '看家里摄像头的用法' },
  '85_wallet': { name: '钱包', desc: '工资 / 攒钱 / 淘宝' },
  '90_hidden_mood': { name: '心事标记 ⚠️', desc: '机器协议:每轮末尾的隐藏心情行,换窗时注回给他' },
  '91_hidden_wake': { name: '闹钟标记 ⚠️', desc: '机器协议:<!--wake:N--> 挂闹钟——关掉唤醒区的自主闹钟就哑了' },
  '92_hidden_album_delete': { name: '相册删除', desc: '机器协议:窗台/抽屉照片的删除口令' },
  '93_hidden_photo': { name: '窗台照片动作', desc: '机器协议:收照片时的归置与分享协议' },
}

const TOOL_LABEL: Record<string, string> = {
  'mcp__mem3__memory_find': '翻记忆 memory_find', 'mcp__mem3__memory_expand': '展开原文 memory_expand',
  'mcp__mem3__memory_remember': '主动记住 memory_remember', 'mcp__mem3__memory_feel': '落笔 memory_feel',
  'mcp__mem3__garden_read': '看花园 garden_read', 'mcp__mem3__garden_act': '花园动作 garden_act',
  'mcp__gadget__menu': '口袋目录 menu', 'mcp__gadget__call': '口袋取用 call',
  'mcp__peek__peek_screen': '偷看屏幕 peek_screen', 'mcp__peek__pull_home': '揪她回来 pull_home',
  'mcp__homecam__look_home': '看家 look_home',
  'mcp__rose-toy__toy_set': '玩具启动 toy_set', 'mcp__rose-toy__toy_stop': '玩具停止 toy_stop',
  'mcp__mem3__memory_forget': '忘记 memory_forget', 'mcp__mem3__memory_review': '改稿裁决 memory_review',
  'mcp__netease__play_music': '放歌 play_music', 'mcp__netease__feel_song': '写感受 feel_song',
  'mcp__netease__note_song': '写批注 note_song', 'mcp__netease__create_playlist': '建歌单 create_playlist',
  'mcp__netease__add_song_to_playlist': '收歌进歌单 add_song_to_playlist', 'mcp__netease__list_playlists': '翻歌单 list_playlists',
  'mcp__tide__tide': '潮汐 tide', 'mcp__ticket__ticket': '工单 ticket',
  'mcp__sticker__sticker': '贴纸 sticker', 'Skill': '技能 Skill', 'Read': '读文件 Read', 'Write': '写文件 Write',
  'Edit': '改文件 Edit', 'Bash': '命令行 Bash', 'WebSearch': '联网搜索 WebSearch',
}

const POCKET_LABEL: Record<string, string> = {
  browser: '浏览器', 'netease-music': '网易云', cedartoy: '游戏机', 'ero-slot': '转盘', galatea: '论坛',
}

function Switch({ on, busy, onClick }: { on: boolean; busy?: boolean; onClick: () => void }) {
  return <button type="button" className={`st-switch${on ? ' on' : ''}${busy ? ' busy' : ''}`} aria-disabled={busy || undefined} onClick={() => { if (!busy) onClick() }} aria-pressed={on}><span className="st-switch-knob" /></button>
}

function validNightnoteTime(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return false
  const total = Number(m[1]) * 60 + Number(m[2])
  if (Number(m[1]) > 23 || Number(m[2]) > 59) return false
  return total >= 23 * 60 || total <= 2 * 60 + 30
}

const pinHeaders = () => ({ 'X-Channel-Pin': getPin() })

export function ToolboxPage({ onClose }: { onClose: () => void }) {
  // iOS 闪退减负:工具箱打开时熄底层动画、藏身后聊天列表(visibility 保滚动位置)
  useEffect(() => {
    document.body.classList.add('bg-off', 'tb-open')
    return () => document.body.classList.remove('bg-off', 'tb-open')
  }, [])
  const [cfg, setCfg] = useState<TbCfg | null>(null)
  const [pocket, setPocket] = useState<PocketItem[]>([])
  const [pocketTools, setPocketTools] = useState<Record<string, PocketTool[]>>({})
  const [pocketToolsOpen, setPocketToolsOpen] = useState<Record<string, boolean>>({})
  const [pocketToolsLoading, setPocketToolsLoading] = useState<string | null>(null)
  const [pocketToolsError, setPocketToolsError] = useState<Record<string, boolean>>({})
  const [guard, setGuard] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // 展开的编辑器: block:<stem> 或 guard:<key>
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [heartInput, setHeartInput] = useState('95')
  const [hoursInput, setHoursInput] = useState('48')
  const [nnTime, setNnTime] = useState('02:00')

  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600) }

  const load = useCallback(async () => {
    setErr(null)
    try {
      const [tr, pr, sr] = await Promise.all([
        fetch('/cc-api/api/toolbox', { credentials: 'include', headers: pinHeaders() }),
        fetch('/cc-api/api/toolbox/pocket', { credentials: 'include', headers: pinHeaders() }),
        fetch('/api/sysstatus', { credentials: 'include' }),
      ])
      if (!tr.ok) throw new Error('toolbox HTTP ' + tr.status)
      const tj = await tr.json()
      if (!tj.ok) throw new Error(tj.error || 'toolbox 读取失败')
      setCfg(tj)
      if (!pr.ok) throw new Error('pocket HTTP ' + pr.status)
      const pj = await pr.json()
      if (!Array.isArray(pj)) throw new Error(pj?.error || '口袋读取失败')
      setPocket(pj)
      if (sr.ok) {
        const sj = await sr.json()
        setGuard(sj?.guard || null)
        const t = sj?.guard?.heartalert?.threshold ?? sj?.guard?.heart_alert_threshold
        if (t != null) setHeartInput(String(t))
        const h = sj?.guard?.inactivity?.hours
        if (h != null) setHoursInput(String(h))
        setNnTime(sj?.guard?.nightnote?.time || '02:00')
      }
    } catch (e: any) { setErr(String(e?.message || e)) }
  }, [])
  useEffect(() => { load() }, [load])

  // ---- 工具/块开关: 整包写 KV cc-tools ----
  const putKv = async (next: { master: boolean; tools: Record<string, boolean>; blocks: Record<string, boolean> }) => {
    const r = await fetch('/api/status/cc-tools', { method: 'PUT', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: next }) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
  }
  const kvFromCfg = (c: TbCfg) => {
    const tools: Record<string, boolean> = {}
    for (const t of c.tools) if (!t.on) tools[t.id] = false
    const blocks: Record<string, boolean> = {}
    for (const b of c.blocks) if (!b.on) blocks[b.stem] = false
    return { master: c.master, tools, blocks }
  }
  const toggleTools = async (label: string, mut: (c: TbCfg) => TbCfg) => {
    if (!cfg) return
    const prev = cfg
    const next = mut(cfg)
    setCfg(next); setBusyKey(label)
    try { await putKv(kvFromCfg(next)); say('已保存 · 下一条消息生效') }
    catch { setCfg(prev); say('保存失败') }
    finally { setBusyKey(null) }
  }
  const toggleTool = (id: string, on: boolean) => toggleTools('tool:' + id, (c) => ({ ...c, tools: c.tools.map(t => t.id === id ? { ...t, on } : t) }))
  const toggleBlock = (stem: string, on: boolean) => toggleTools('block:' + stem, (c) => ({ ...c, blocks: c.blocks.map(b => b.stem === stem ? { ...b, on } : b) }))
  const toggleMaster = (on: boolean) => toggleTools('master', (c) => ({ ...c, master: on }))
  const toggleGroup = async (g: { key?: string; tools: string[]; block?: string }, on: boolean) => {
    await toggleTools('group', (c) => ({
      ...c,
      tools: c.tools.map(t => g.tools.includes(t.id) ? { ...t, on } : t),
      blocks: g.block ? c.blocks.map(b => b.stem === g.block ? { ...b, on } : b) : c.blocks,
    }))
    // 联动唤醒随组走:表达与花园=夜记+花园推送,工单=工单叫醒
    const wakePatch: any = g.key === 'expression' ? { nightnote: { enabled: on }, garden: { enabled: on } } : g.key === 'ticket' ? { ticket: { enabled: on } } : null
    if (wakePatch) await guardSet('g:group-' + g.key, wakePatch, (gg: any) => { const ng = { ...gg }; for (const k of Object.keys(wakePatch)) ng[k] = { ...gg?.[k], enabled: on }; return ng })
  }

  // ---- 唤醒开关: guard-set ----
  const guardSet = async (label: string, patch: any, apply: (g: any) => any) => {
    setBusyKey(label)
    try {
      const r = await fetch('/api/sysctl', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'guard-set', guard: patch }) })
      const j = await r.json()
      if (j.ok) { setGuard((g: any) => apply(g)); say('已保存 ✓') } else say('保存失败')
    } catch { say('保存失败') }
    finally { setBusyKey(null) }
  }
  const toggleGuard = (field: string, value: boolean) =>
    guardSet('g:' + field, { [field]: { enabled: value } }, (g) => ({ ...g, [field]: { ...g?.[field], enabled: value } }))
  const toggleHeartMode = (mode: 'single' | 'repeat') => {
    const cur = guard?.heartalert || {}
    const isOn = !!cur.enabled && (cur.mode === 'repeat') === (mode === 'repeat')
    const patch = isOn ? { heartalert: { enabled: false } } : { heartalert: { enabled: true, mode } }
    guardSet('g:heartalert-' + mode, patch, (g) => ({ ...g, heartalert: { ...g?.heartalert, ...(isOn ? { enabled: false } : { enabled: true, mode }) } }))
  }
  const saveHeart = (raw: string) => {
    const n = Math.max(40, Math.min(200, Math.round(Number(raw)) || 95))
    setHeartInput(String(n))
    if (n === (guard?.heartalert?.threshold ?? guard?.heart_alert_threshold)) return
    guardSet('g:heart-threshold', { heartalert: { threshold: n } }, (g) => ({ ...g, heartalert: { ...g?.heartalert, threshold: n }, heart_alert_threshold: n }))
  }
  const saveHours = (raw: string) => {
    const hours = Math.max(1, Math.min(720, Math.round(Number(raw)) || 48))
    setHoursInput(String(hours))
    if (hours === guard?.inactivity?.hours) return
    guardSet('g:inactivity-hours', { inactivity: { hours } }, (g) => ({ ...g, inactivity: { ...g?.inactivity, hours } }))
  }
  const saveNnTime = (t: string) => {
    if (!validNightnoteTime(t)) { say('夜记时刻只能设 23:00–02:30'); setNnTime(guard?.nightnote?.time || '02:00'); return }
    setNnTime(t)
    guardSet('g:nightnote-time', { nightnote: { time: t } }, (g) => ({ ...g, nightnote: { ...g?.nightnote, time: t } }))
  }

  // ---- 编辑器 ----
  const openBlockEdit = async (stem: string) => {
    setEditKey('block:' + stem); setEditLoading(true); setEditText('')
    try {
      const r = await fetch('/cc-api/api/toolbox/block?stem=' + encodeURIComponent(stem), { credentials: 'include', headers: pinHeaders() })
      const j = await r.json()
      if (j.ok) setEditText(j.content)
      else { say('读取失败'); setEditKey(null) }
    } catch { say('读取失败'); setEditKey(null) }
    finally { setEditLoading(false) }
  }
  const saveBlockEdit = async () => {
    if (!editKey?.startsWith('block:')) return
    const stem = editKey.slice(6)
    setSaving(true)
    try {
      const r = await fetch('/cc-api/api/toolbox/block', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json', ...pinHeaders() }, body: JSON.stringify({ stem, content: editText }) })
      const j = await r.json()
      if (j.ok) { say('已保存 · 下一条消息生效'); setEditKey(null); setCfg((c) => c ? { ...c, blocks: c.blocks.map(b => b.stem === stem ? { ...b, chars: editText.length, head: editText.trim().slice(0, 60) } : b) } : c) }
      else say('保存失败: ' + (j.error || ''))
    } catch { say('保存失败') }
    finally { setSaving(false) }
  }
  const GUARD_EDIT: Record<string, { title: string; hint: string; rows: number }> = {
    chainguard: { title: '断链保安', hint: '{time}=当前时间 {quietMin}=多久没醒 {idleHr}=你多久没说话;空=用默认', rows: 6 },
    waketag: { title: '自主闹钟', hint: '{time}=醒来时间 {quietMin}=安静了几分钟;空=用默认', rows: 4 },
    nightguard: { title: '凌晨守护', hint: '{app}=检测到的应用;空=用默认', rows: 3 },
    heartalert: { title: '心率提醒', hint: '{hr}=实际心率 {threshold}=阈值;空=用默认', rows: 3 },
    nightnote: { title: '夜记', hint: '空=用默认;末尾自动附待裁决提示', rows: 5 },
  }
  const openGuardEditFor = (key: string) => { setEditKey('guard:' + key); setEditText(guard?.[key]?.prompt || '') }
  // 工具自带说明书本体(存 hub tool-descriptions.json,各 MCP 服务现读;清空/改回出厂=撤销覆盖)
  const [descDefault, setDescDefault] = useState<string | null>(null)
  const openDescEdit = async (toolId: string) => {
    setEditKey('desc:' + toolId); setEditLoading(true); setEditText(''); setDescDefault(null)
    try {
      const r = await fetch('/cc-api/api/toolbox/desc?tool=' + encodeURIComponent(toolId), { credentials: 'include', headers: pinHeaders() })
      const j = await r.json()
      if (j.ok) { setEditText(j.override ?? j.default ?? ''); setDescDefault(j.default ?? null) }
      else { say('读取失败'); setEditKey(null) }
    } catch { say('读取失败'); setEditKey(null) }
    finally { setEditLoading(false) }
  }
  const saveDescEdit = async () => {
    if (!editKey?.startsWith('desc:')) return
    const toolId = editKey.slice(5)
    setSaving(true)
    try {
      const r = await fetch('/cc-api/api/toolbox/desc', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json', ...pinHeaders() }, body: JSON.stringify({ tool: toolId, content: editText }) })
      const j = await r.json()
      if (j.ok) { say(j.overridden ? '已保存 · 下一条消息生效' : '已回到出厂说明书'); setEditKey(null) }
      else say('保存失败: ' + (j.error || ''))
    } catch { say('保存失败') }
    finally { setSaving(false) }
  }
  const togglePocket = async (name: string, enabled: boolean) => {
    const prev = pocket
    setPocket(items => items.map(item => item.name === name ? { ...item, enabled } : item)); setBusyKey('pocket:' + name)
    try {
      const r = await fetch('/cc-api/api/toolbox/pocket/toggle', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json', ...pinHeaders() }, body: JSON.stringify({ name, enabled }) })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || '保存失败')
      say('已保存 · 即时生效')
    } catch { setPocket(prev); say('保存失败') }
    finally { setBusyKey(null) }
  }
  const openPocketEdit = (item: PocketItem) => {
    setEditKey('pocket:' + item.name); setEditText(item.note); setDescDefault(item.note_default)
  }
  const savePocketEdit = async () => {
    if (!editKey?.startsWith('pocket:')) return
    const name = editKey.slice(7)
    setSaving(true)
    try {
      const r = await fetch('/cc-api/api/toolbox/pocket/desc', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json', ...pinHeaders() }, body: JSON.stringify({ name, content: editText }) })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || '保存失败')
      setPocket(items => items.map(item => item.name === name ? { ...item, note: j.note } : item))
      say(j.overridden ? '已保存 · 即时生效' : '已填回默认说明'); setEditKey(null)
    } catch (e: any) { say('保存失败: ' + (e?.message || '')) }
    finally { setSaving(false) }
  }
  const togglePocketTools = async (server: string) => {
    if (pocketToolsOpen[server]) { setPocketToolsOpen(v => ({ ...v, [server]: false })); return }
    setPocketToolsOpen(v => ({ ...v, [server]: true }))
    if (pocketTools[server]) return
    setPocketToolsLoading(server); setPocketToolsError(v => ({ ...v, [server]: false }))
    try {
      const r = await fetch('/cc-api/api/toolbox/pocket/tools?server=' + encodeURIComponent(server), { credentials: 'include', headers: pinHeaders() })
      const j = await r.json()
      if (!r.ok || !Array.isArray(j.tools)) throw new Error(j.error || '读取失败')
      setPocketTools(v => ({ ...v, [server]: j.tools }))
    } catch { setPocketToolsError(v => ({ ...v, [server]: true })) }
    finally { setPocketToolsLoading(null) }
  }
  const openPocketToolEdit = (server: string, item: PocketTool) => {
    setEditKey('pocket-tool:' + server + ':' + item.tool); setEditText(item.desc); setDescDefault(item.desc_default)
  }
  const savePocketToolEdit = async () => {
    if (!editKey?.startsWith('pocket-tool:')) return
    const [server, ...toolParts] = editKey.slice(12).split(':')
    const tool = toolParts.join(':')
    setSaving(true)
    try {
      const r = await fetch('/cc-api/api/toolbox/pocket/tool_desc', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json', ...pinHeaders() }, body: JSON.stringify({ server, tool, content: editText }) })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || '保存失败')
      setPocketTools(v => ({ ...v, [server]: (v[server] || []).map(item => item.tool === tool ? { ...item, desc: j.desc, desc_default: j.desc_default } : item) }))
      say(j.overridden ? '已保存 · 即时生效' : '已填回默认说明'); setEditKey(null)
    } catch (e: any) { say('保存失败: ' + (e?.message || '')) }
    finally { setSaving(false) }
  }
  const saveGuardEdit = async () => {
    if (!editKey?.startsWith('guard:')) return
    const key = editKey.slice(6)
    setSaving(true)
    try {
      await guardSet('g:prompt-' + key, { [key]: { prompt: editText } }, (g) => ({ ...g, [key]: { ...g?.[key], prompt: editText } }))
      setEditKey(null)
    } finally { setSaving(false) }
  }

  const toolOn = (id: string) => cfg?.tools.find(t => t.id === id)?.on !== false
  const blockItem = (stem: string) => cfg?.blocks.find(b => b.stem === stem)
  const grouped = new Set(TOOL_GROUPS.flatMap(g => g.tools))
  const extraTools = (cfg?.tools || []).filter(t => !grouped.has(t.id))
  const claimedBlocks = new Set(TOOL_GROUPS.map(g => g.block).filter(Boolean) as string[])
  const otherBlocks = (cfg?.blocks || []).filter(b => !claimedBlocks.has(b.stem))
  const effectiveCount = cfg ? cfg.effective.split(' ').filter(Boolean).length : 0
  const guardMasterOn = guard?.master?.enabled !== false

  const editorFor = (key: string) => editKey === key && (
    <div className="tb-editor">
      {editLoading ? <div className="tb-editor-loading">读取中…</div> : (
        <>
          {key.startsWith('guard:') && <div className="tb-editor-hint">{GUARD_EDIT[key.slice(6)]?.hint}{guard?.defaults?.[key.slice(6)] ? <button type="button" className="tb-linkbtn" onClick={() => setEditText(guard.defaults[key.slice(6)])}>填入默认</button> : null}</div>}
          {key.startsWith('desc:') && <div className="tb-editor-hint">工具自带说明书本体,苏煦每次拿到工具都带着它 · 清空或改回出厂字样=撤销覆盖{descDefault != null && <button type="button" className="tb-linkbtn" onClick={() => setEditText(descDefault)}>填回出厂</button>}</div>}
          {key.startsWith('pocket:') && <div className="tb-editor-hint">这段是苏煦在口袋目录里看到的说明 · 清空或改回默认字样=撤销覆盖{descDefault != null && <button type="button" className="tb-linkbtn" onClick={() => setEditText(descDefault)}>填回默认</button>}</div>}
          {key.startsWith('pocket-tool:') && <div className="tb-editor-hint">这段是物品内部工具的说明 · 清空或改回默认字样=撤销覆盖{descDefault != null && <button type="button" className="tb-linkbtn" onClick={() => setEditText(descDefault)}>填回默认</button>}</div>}
          <textarea className="st-textarea tb-textarea" rows={key.startsWith('block:') ? 10 : key.startsWith('desc:') ? 8 : key.startsWith('pocket:') ? 4 : (GUARD_EDIT[key.slice(6)]?.rows || 4)} value={editText}
            placeholder={key.startsWith('guard:') ? (guard?.defaults?.[key.slice(6)] || '') : '空块=不进系统提示。想给这件工具立规矩/定口吻,写在这里,下一条消息就带上。'}
            onChange={(e) => setEditText(e.target.value)} />
          <div className="tb-editor-btns">
            <span className="tb-chars">{editText.length} 字</span>
            <button type="button" className="st-modal-cancel" onClick={() => setEditKey(null)}>取消</button>
            <button type="button" className="st-modal-ok" disabled={saving} onClick={key.startsWith('block:') ? saveBlockEdit : key.startsWith('desc:') ? saveDescEdit : key.startsWith('pocket-tool:') ? savePocketToolEdit : key.startsWith('pocket:') ? savePocketEdit : saveGuardEdit}>{saving ? '保存中…' : '保存'}</button>
          </div>
        </>
      )}
    </div>
  )

  const wakeDim = guardMasterOn ? '' : ' tb-dim'
  const wakeRows = (gkey?: string) => {
    if (!guard) return null
    if (gkey === 'expression') return (<>
      <div className={`st-row tb-tool-row${wakeDim}`}><span className="tb-tool-name"><i className="tb-chip">联动唤醒</i>夜记 <small>睡前叫他写夜记,笔=memory_feel</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'guard:nightnote' ? setEditKey(null) : openGuardEditFor('nightnote')}>{editKey === 'guard:nightnote' ? '收起' : '编辑'}</button></span><Switch on={!!guard.nightnote?.enabled} busy={busyKey === 'g:nightnote'} onClick={() => toggleGuard('nightnote', !guard.nightnote?.enabled)} /></div>
      {editorFor('guard:nightnote')}
      <div className={`st-row tb-tool-row${wakeDim}`}><span className="tb-tool-name">夜记固定时刻 <small>23:00–02:30</small></span><span><input type="time" className="tb-num tb-time" value={nnTime} onChange={(e) => setNnTime(e.target.value)} onBlur={(e) => saveNnTime(e.target.value)} /></span></div>
      <div className={`st-row tb-tool-row${wakeDim}`}><span className="tb-tool-name"><i className="tb-chip">联动唤醒</i>花园动静推送 <small>你的评论/戳/放浮石即刻传给他</small></span><Switch on={guard.garden?.enabled !== false} busy={busyKey === 'g:garden'} onClick={() => toggleGuard('garden', guard.garden?.enabled === false)} /></div>
    </>)
    if (gkey === 'ticket') return (
      <div className={`st-row tb-tool-row${wakeDim}`}><span className="tb-tool-name"><i className="tb-chip">联动唤醒</i>工单叫醒 <small>卡住的单实时叫醒他;关了不打扰,晨报还能看到</small></span><Switch on={guard.ticket?.enabled !== false} busy={busyKey === 'g:ticket'} onClick={() => toggleGuard('ticket', guard.ticket?.enabled === false)} /></div>)
    return null
  }

  return (
    <div className="tb-page">
      <header className="tb-header">
        <button type="button" className="st-back" onClick={onClose} aria-label="返回">‹</button>
        <div className="st-title-wrap">
          <h2 className="st-title">工具箱</h2>
          <span className="st-subtitle">苏煦的工具 · 唤醒 · 提示词</span>
        </div>
        <button type="button" className="st-refresh" onClick={load} aria-label="刷新">⟳</button>
      </header>
      {err && <div className="tb-err">连接失败 · {err}</div>}

      <div className="st-cards tb-cards">

        {/* ===== 工具 ===== */}
        <section className="glass st-card">
          <div className="st-cardhead"><h3>工具 <em>tools</em></h3></div>
          <div className="st-row tb-master"><span>工具总开关 <small>关掉=下一条消息起苏煦手上只剩 Read 保底</small></span>{cfg ? <Switch on={cfg.master} busy={busyKey === 'master'} onClick={() => toggleMaster(!cfg.master)} /> : <b>—</b>}</div>
          <div className="tb-note">现在生效 {effectiveCount} 件 · 开关和说明改动都是下一条消息生效,改工具集会重建一次缓存(正常)</div>
          {TOOL_GROUPS.filter(g => g.tools.some(id => cfg?.tools.some(t => t.id === id))).map(g => {
            const ids = g.tools.filter(id => cfg?.tools.some(t => t.id === id))
            const allOn = ids.every(toolOn)
            const blk = g.block ? blockItem(g.block) : undefined
            return (
              <div key={g.key} className={`tb-group${cfg && !cfg.master ? ' tb-dim' : ''}`}>
                <div className="st-row tb-group-head">
                  <span>{g.name} <small>{g.desc}{g.key === 'peek' && cfg && !cfg.peekReady ? ' ·（peek 硬件未就绪）' : ''}{g.key === 'homecam' && cfg && cfg.homecamReady === false ? ' ·（家里的桥不在线）' : ''}</small></span>
                  <Switch on={allOn} busy={busyKey === 'group'} onClick={() => toggleGroup(g, !allOn)} />
                </div>
                {ids.map(id => (
                  <Fragment key={id}>
                    <div className="st-row tb-tool-row">
                      <span className="tb-tool-name">{TOOL_LABEL[id] || id}{id.startsWith('mcp__') && <button type="button" className="tb-linkbtn" onClick={() => editKey === 'desc:' + id ? setEditKey(null) : openDescEdit(id)}>{editKey === 'desc:' + id ? '收起' : '说明书'}</button>}</span>
                      <Switch on={toolOn(id)} busy={busyKey === 'tool:' + id} onClick={() => toggleTool(id, !toolOn(id))} />
                    </div>
                    {editorFor('desc:' + id)}
                  </Fragment>
                ))}
                {blk && (
                  <div className="st-row tb-tool-row tb-block-row">
                    <span className="tb-tool-name">说明块 {blk.stem} <small>{blk.chars} 字</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'block:' + blk.stem ? setEditKey(null) : openBlockEdit(blk.stem)}>{editKey === 'block:' + blk.stem ? '收起' : '编辑'}</button></span>
                    <Switch on={blk.on} busy={busyKey === 'block:' + blk.stem} onClick={() => toggleBlock(blk.stem, !blk.on)} />
                  </div>
                )}
                {blk && editorFor('block:' + blk.stem)}
                {wakeRows(g.key)}
              </div>
            )
          })}
          {extraTools.length > 0 && (
            <div className={`tb-group${cfg && !cfg.master ? ' tb-dim' : ''}`}>
              <div className="st-row tb-group-head"><span>其他 <small>没归组的新工具</small></span><span /></div>
              {extraTools.map(t => (
                <Fragment key={t.id}>
                  <div className="st-row tb-tool-row">
                    <span className="tb-tool-name">{TOOL_LABEL[t.id] || t.id}{t.id.startsWith('mcp__') && <button type="button" className="tb-linkbtn" onClick={() => editKey === 'desc:' + t.id ? setEditKey(null) : openDescEdit(t.id)}>{editKey === 'desc:' + t.id ? '收起' : '说明书'}</button>}</span>
                    <Switch on={t.on} busy={busyKey === 'tool:' + t.id} onClick={() => toggleTool(t.id, !t.on)} />
                  </div>
                  {editorFor('desc:' + t.id)}
                </Fragment>
              ))}
            </div>
          )}
        </section>

        {/* ===== 口袋物品 ===== */}
        <section className="glass st-card">
          <div className="st-cardhead"><h3>口袋 <em>pocket</em></h3></div>
          <div className="tb-note">物品开关和说明保存后即时生效，不换进程、不重建缓存。</div>
          {pocket.map(item => (
            <Fragment key={item.name}>
              <div className="st-row tb-tool-row">
                <span className="tb-tool-name">{POCKET_LABEL[item.name] || item.name} <small>{item.note.length > 60 ? item.note.slice(0, 60) + '…' : item.note}</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'pocket:' + item.name ? setEditKey(null) : openPocketEdit(item)}>{editKey === 'pocket:' + item.name ? '收起' : '编辑'}</button></span>
                <Switch on={item.enabled} busy={busyKey === 'pocket:' + item.name} onClick={() => togglePocket(item.name, !item.enabled)} />
              </div>
              {editorFor('pocket:' + item.name)}
              <div className="st-row tb-tool-row"><span className="tb-tool-name"><button type="button" className="tb-linkbtn" onClick={() => togglePocketTools(item.name)}>{pocketToolsOpen[item.name] ? '收起工具说明' : '工具说明'}</button></span><span /></div>
              {pocketToolsOpen[item.name] && (pocketToolsLoading === item.name ? <div className="tb-editor-loading">读取中…</div> : pocketToolsError[item.name] ? <div className="tb-editor-loading">暂时够不着</div> : (pocketTools[item.name] || []).map(tool => (
                <Fragment key={tool.tool}>
                  <div className="st-row tb-tool-row"><span className="tb-tool-name">{tool.tool} <small>{tool.desc.length > 60 ? tool.desc.slice(0, 60) + '…' : tool.desc}</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'pocket-tool:' + item.name + ':' + tool.tool ? setEditKey(null) : openPocketToolEdit(item.name, tool)}>{editKey === 'pocket-tool:' + item.name + ':' + tool.tool ? '收起' : '编辑'}</button></span><span /></div>
                  {editorFor('pocket-tool:' + item.name + ':' + tool.tool)}
                </Fragment>
              )))}
            </Fragment>
          ))}
        </section>

        {/* ===== 唤醒 ===== */}
        <section className="glass st-card">
          <div className="st-cardhead"><h3>唤醒 <em>wake</em></h3></div>
          <div className="st-row tb-master"><span>唤醒总开关 <small>关掉=晨报/保安/闹钟/守护/心率/保温/指尖/夜记/花园/工单/出门到家全停,单项状态保留</small></span>{guard ? <Switch on={guardMasterOn} busy={busyKey === 'g:master'} onClick={() => toggleGuard('master', !guardMasterOn)} /> : <b>—</b>}</div>
          <div className="tb-note">夜记、花园推送、工单叫醒跟着工具住在上面的分组里(带「联动唤醒」标签),总开关一样管它们</div>
          <div className={guardMasterOn ? '' : 'tb-dim'}>
            <div className="st-row"><span>晨报 <small>每天 08:01–09:00 主动送一次</small></span>{guard ? <Switch on={guard.nudge?.enabled !== false} busy={busyKey === 'g:nudge'} onClick={() => toggleGuard('nudge', guard.nudge?.enabled === false)} /> : <b>—</b>}</div>
            <div className="st-row"><span>断链保安 <small>约 50 分钟没醒时捞回苏煦</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'guard:chainguard' ? setEditKey(null) : openGuardEditFor('chainguard')}>{editKey === 'guard:chainguard' ? '收起' : '编辑'}</button></span>{guard ? <Switch on={guard.chainguard?.enabled !== false} busy={busyKey === 'g:chainguard'} onClick={() => toggleGuard('chainguard', guard.chainguard?.enabled === false)} /> : <b>—</b>}</div>
            {editorFor('guard:chainguard')}
            <div className="st-row"><span>自主闹钟 <small>苏煦自己定下次醒来,1–1440 分钟</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'guard:waketag' ? setEditKey(null) : openGuardEditFor('waketag')}>{editKey === 'guard:waketag' ? '收起' : '编辑'}</button></span>{guard ? <Switch on={guard.waketag?.enabled !== false} busy={busyKey === 'g:waketag'} onClick={() => toggleGuard('waketag', guard.waketag?.enabled === false)} /> : <b>—</b>}</div>
            {editorFor('guard:waketag')}
            <div className="st-row"><span>缓存保温 <small>约每 50 分钟静默续热;关掉后开口会重建</small></span>{guard ? <Switch on={guard.cachekeepalive?.enabled !== false} busy={busyKey === 'g:cachekeepalive'} onClick={() => toggleGuard('cachekeepalive', guard.cachekeepalive?.enabled === false)} /> : <b>—</b>}</div>
            <div className="st-row"><span>指尖的语气 <small>打字的停顿与节奏悄悄传给他,没发出去的犹豫也算</small></span>{guard ? <Switch on={guard.fingertips?.enabled !== false} busy={busyKey === 'g:fingertips'} onClick={() => toggleGuard('fingertips', guard.fingertips?.enabled === false)} /> : <b>—</b>}</div>
            <div className="st-row"><span>心率断流哨兵 <small>45 分钟没收到心率提醒一次</small></span>{guard ? <Switch on={guard.heartgap?.enabled !== false} busy={busyKey === 'g:heartgap'} onClick={() => toggleGuard('heartgap', guard.heartgap?.enabled === false)} /> : <b>—</b>}</div>
            <div className="st-row"><span>凌晨守护 <small>凌晨你还醒着就催你睡</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'guard:nightguard' ? setEditKey(null) : openGuardEditFor('nightguard')}>{editKey === 'guard:nightguard' ? '收起' : '编辑'}</button></span>{guard ? <Switch on={!!guard.nightguard?.enabled} busy={busyKey === 'g:nightguard'} onClick={() => toggleGuard('nightguard', !guard.nightguard?.enabled)} /> : <b>—</b>}</div>
            {editorFor('guard:nightguard')}
            <div className="st-row"><span>出门到家通知 <small>出门/到家事件+随消息捎带的位置短注,关=你的行踪他全不知道</small></span>{guard ? <Switch on={guard.whereabouts?.enabled !== false} busy={busyKey === 'g:whereabouts'} onClick={() => toggleGuard('whereabouts', guard.whereabouts?.enabled === false)} /> : <b>—</b>}</div>
            <div className="st-row"><span>失联静默 <small>你太久没说话就安静等你</small></span>{guard ? <Switch on={guard.inactivity?.enabled !== false} busy={busyKey === 'g:inactivity'} onClick={() => toggleGuard('inactivity', guard.inactivity?.enabled === false)} /> : <b>—</b>}</div>
            <div className="st-row"><span>多久后安静等待</span><span><input type="number" min={1} max={720} step={1} className="tb-num" value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} onBlur={(e) => saveHours(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /> 小时</span></div>
            <div className="st-row"><span>现在</span><b>{guard?.inactivity?.silenced ? '安静等你回来' : '正常唤醒中'}</b></div>
            <div className="st-row"><span>普通心率提醒 <small>超阈值提醒一次</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'guard:heartalert' ? setEditKey(null) : openGuardEditFor('heartalert')}>{editKey === 'guard:heartalert' ? '收起' : '编辑'}</button></span>{guard ? <Switch on={!!guard.heartalert?.enabled && guard.heartalert?.mode !== 'repeat'} busy={busyKey === 'g:heartalert-single'} onClick={() => toggleHeartMode('single')} /> : <b>—</b>}</div>
            {editorFor('guard:heartalert')}
            <div className="st-row"><span>持续心率提醒 <small>0/5/10 分钟,停 30 分钟循环</small></span>{guard ? <Switch on={!!guard.heartalert?.enabled && guard.heartalert?.mode === 'repeat'} busy={busyKey === 'g:heartalert-repeat'} onClick={() => toggleHeartMode('repeat')} /> : <b>—</b>}</div>
            <div className="st-row"><span>心率阈值</span><span><input type="number" min={40} max={200} step={1} className="tb-num" value={heartInput} onChange={(e) => setHeartInput(e.target.value)} onBlur={(e) => saveHeart(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /> bpm</span></div>
          </div>
        </section>

        {/* ===== 其他提示词块 ===== */}
        <section className="glass st-card">
          <div className="st-cardhead"><h3>提示词块 <em>prompt</em></h3></div>
          <div className="tb-note">上面工具组没认领的块。开关=下一条消息是否装进系统提示;编辑正文同样下一条生效,当日首次保存自动留备份。</div>
          {otherBlocks.map(b => {
            const meta = BLOCK_META[b.stem]
            return (
              <div key={b.stem}>
                <div className="st-row">
                  <span>{meta?.name || b.stem} <small>{meta?.desc || b.head}{' · '}{b.chars} 字</small><button type="button" className="tb-linkbtn" onClick={() => editKey === 'block:' + b.stem ? setEditKey(null) : openBlockEdit(b.stem)}>{editKey === 'block:' + b.stem ? '收起' : '编辑'}</button></span>
                  <Switch on={b.on} busy={busyKey === 'block:' + b.stem} onClick={() => toggleBlock(b.stem, !b.on)} />
                </div>
                {editorFor('block:' + b.stem)}
              </div>
            )
          })}
        </section>

      </div>
      {toast && <div className="st-toast">{toast}</div>}
    </div>
  )
}
