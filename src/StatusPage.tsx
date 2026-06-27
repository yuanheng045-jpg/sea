import { useEffect, useState, useCallback } from 'react'

type Sys = any

const dash = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v))

function fmtTime(iso?: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const bj = new Date(d.getTime() + 8 * 3600 * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(bj.getUTCMonth() + 1)}/${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`
  } catch { return '—' }
}
function ago(iso?: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const m = Math.floor(ms / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

const PORT_SVC: Record<string, { target: string; label: string }> = {
  '3100': { target: 'memory', label: 'Memory :3100' },
  '3200': { target: 'voice', label: 'Voice :3200' },
  '3456': { target: 'hub', label: 'Hub :3456' },
  '4318': { target: 'whereabouts', label: 'Whereabouts :4318' },
  '8808': { target: 'puppy-mcp', label: 'puppy-mcp :8808' },
}
const WARN: Record<string, string> = {
  hub: '会重启苏煦的聊天后端，他会断线几秒。',
  memory: '会重启记忆中枢，本页面会短暂无响应、稍后请手动刷新。',
  'puppy-mcp': '会断开 MCP（Claude app/Code 连接）几秒。',
  voice: '会重启语音服务。',
  whereabouts: '会重启行踪服务。',
}

function Gear({ size = 80, teeth = 28, spokes = 5, spin = 0, reverse = false, className = '' }:
  { size?: number; teeth?: number; spokes?: number; spin?: number; reverse?: boolean; className?: string }) {
  const cx = 50, cy = 50, rRoot = 43, rTip = 49
  const pitch = (2 * Math.PI) / teeth
  const wRoot = 0.30 * pitch, wTip = 0.17 * pitch
  const polys: string[] = []
  for (let i = 0; i < teeth; i++) {
    const a = i * pitch - Math.PI / 2
    polys.push([[rRoot, a - wRoot], [rTip, a - wTip], [rTip, a + wTip], [rRoot, a + wRoot]]
      .map(([r, ang]) => `${(cx + r * Math.cos(ang)).toFixed(2)},${(cy + r * Math.sin(ang)).toFixed(2)}`).join(' '))
  }
  const sp = []
  for (let i = 0; i < spokes; i++) sp.push(<rect key={i} x={49} y={20} width={2} height={21} rx={1} transform={`rotate(${(i / spokes) * 360} 50 50)`} />)
  const style = spin ? { animation: `gear-spin ${spin}s linear infinite${reverse ? ' reverse' : ''}` } : undefined
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`gear ${className}`} style={style} aria-hidden>
      <g fill="currentColor">{polys.map((pp, i) => <polygon key={i} points={pp} />)}</g>
      <g fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="50" cy="50" r="43" />
        <circle cx="50" cy="50" r="30" />
      </g>
      <g fill="currentColor">{sp}</g>
      <circle cx="50" cy="50" r="9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="50" cy="50" r="3.4" fill="currentColor" />
    </svg>
  )
}

function Butterfly({ size = 38, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`butterfly ${className}`} aria-hidden>
      <g fill="currentColor">
        <path d="M50 50 C34 24, 6 22, 14 44 C7 62, 30 66, 50 50 Z" opacity="0.55" />
        <path d="M50 50 C66 24, 94 22, 86 44 C93 62, 70 66, 50 50 Z" opacity="0.55" />
        <path d="M50 50 C40 58, 22 70, 26 84 C36 80, 47 64, 50 52 Z" opacity="0.4" />
        <path d="M50 50 C60 58, 78 70, 74 84 C64 80, 53 64, 50 52 Z" opacity="0.4" />
      </g>
      <ellipse cx="50" cy="52" rx="2" ry="15" fill="currentColor" opacity="0.7" />
      <line x1="50" y1="40" x2="44" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <line x1="50" y1="40" x2="56" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`st-dot${ok ? ' on' : ' off'}`} />
}

function Switch({ on, busy, onClick }: { on: boolean; busy?: boolean; onClick: () => void }) {
  return <button className={`st-switch${on ? ' on' : ''}${busy ? ' busy' : ''}`} disabled={busy} onClick={onClick} aria-pressed={on}><span className="st-switch-knob" /></button>
}

export function StatusPage({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Sys | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ target: string; label: string } | null>(null)
  const [busyT, setBusyT] = useState<string | null>(null)
  const [actMsg, setActMsg] = useState<string | null>(null)
  const [guardBusy, setGuardBusy] = useState<string | null>(null)
  const [guardEdit, setGuardEdit] = useState<{ nudge: string; nightguard: string } | null>(null)
  const [savingGuard, setSavingGuard] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch('/api/sysstatus', { credentials: 'include' })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setData(await r.json())
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const copyErr = async (it: any, i: number) => {
    const text = `[${it.time}] ${it.unit || ''}${it.location ? '  ' + it.location : ''}\n${it.full || it.summary || ''}`
    try { await navigator.clipboard.writeText(text); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1600) } catch {}
  }

  const doRestart = async () => {
    if (!confirm) return
    const { target, label } = confirm
    setConfirm(null); setBusyT(target); setActMsg(null)
    try {
      const r = await fetch('/api/sysctl', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restart', target }) })
      const j = await r.json()
      setActMsg(j.ok ? `${label} 已重启 ✓` : `${label} 失败：${j.error || r.status}`)
    } catch (e: any) {
      setActMsg(`${label} 失败：${e?.message || e}`)
    } finally {
      setBusyT(null)
      setTimeout(() => { load(); setActMsg(null) }, 4000)
    }
  }

  const toggleGuard = async (field: 'nudge' | 'nightguard', value: boolean) => {
    setGuardBusy(field)
    try {
      const r = await fetch('/api/sysctl', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'guard-set', guard: { [field]: { enabled: value } } }) })
      const j = await r.json()
      if (j.ok) { setData((d: any) => ({ ...d, guard: { ...d.guard, [field]: { ...d.guard[field], enabled: value } } })); setActMsg(`${field === 'nudge' ? '主动找瑶' : '凌晨守护'} 已${value ? '开启' : '关闭'}`) }
      else setActMsg('切换失败')
    } catch { setActMsg('切换失败') }
    finally { setGuardBusy(null); setTimeout(() => setActMsg(null), 2500) }
  }
  const saveGuardEdit = async () => {
    if (!guardEdit) return
    setSavingGuard(true)
    try {
      const r = await fetch('/api/sysctl', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'guard-set', guard: { nudge: { prompt: guardEdit.nudge }, nightguard: { prompt: guardEdit.nightguard } } }) })
      const j = await r.json()
      if (j.ok) { setData((d: any) => ({ ...d, guard: { ...d.guard, nudge: { ...d.guard.nudge, prompt: guardEdit.nudge }, nightguard: { ...d.guard.nightguard, prompt: guardEdit.nightguard } } })); setGuardEdit(null); setActMsg('提示语已保存 ✓') }
      else setActMsg('保存失败')
    } catch { setActMsg('保存失败') }
    finally { setSavingGuard(false); setTimeout(() => setActMsg(null), 2500) }
  }

  const hub = data?.hub, pulse = data?.pulse, mem = data?.memory, guard = data?.guard, eng = data?.engine, logs = data?.logs

  const DOMAIN_LABEL: Record<string, string> = {
    personal_su: '苏', personal_yao: '瑶', work: '工作', life: '生活', feel: '感受', thread: '线程', daily: '日记',
  }

  return (
    <div className="status-page">
      {/* 背景齿轮层（机芯感）*/}
      <div className="st-movement" aria-hidden>
        <Gear size={300} teeth={40} spokes={6} spin={150} className="mv mv-1" />
        <Gear size={210} teeth={32} spokes={5} spin={105} reverse className="mv mv-2" />
        <Gear size={150} teeth={26} spokes={5} spin={82} className="mv mv-3" />
        <Gear size={120} teeth={24} spokes={5} spin={96} reverse className="mv mv-4" />
        <Gear size={92} teeth={20} spokes={4} spin={64} className="mv mv-5" />
        <Butterfly size={66} className="mv-bf mv-bf-1" />
        <Butterfly size={46} className="mv-bf mv-bf-2" />
        <Butterfly size={54} className="mv-bf mv-bf-3" />
      </div>
      <div className="st-inner">

      <header className="st-header">
        <button className="st-back" onClick={onBack} aria-label="返回">‹</button>
        <div className="st-title-wrap">
          <h2 className="st-title">Atlantis</h2>
          <span className="st-subtitle">机芯 · 系统状态</span>
        </div>
        <button className={`st-refresh${loading ? ' spin' : ''}`} onClick={load} aria-label="刷新">⟳</button>
      </header>

      <div className="st-meta">
        {err ? <span className="st-err">连接失败 · {err}</span>
          : <span>更新于 {fmtTime(data?._time)}{data?._time ? ` · ${ago(data._time)}` : ''}</span>}
      </div>

      <div className="st-cards">
        {/* 1. 心脏 */}
        <section className="glass st-card">
          <div className="st-cardhead"><Gear size={26} teeth={20} className="st-ico" /><h3>心脏 <em>hub</em></h3>
            <button className="st-act" disabled={busyT === 'hub'} onClick={() => setConfirm({ target: 'hub', label: '重启 hub' })}>{busyT === 'hub' ? '重启中…' : '重启'}</button>
          </div>
          <div className="st-row"><span>进程</span><b>{hub ? (hub.status === 'running' ? <><Dot ok /> 运行中</> : <><Dot ok={false} /> 停止</>) : '—'}</b></div>
          <div className="st-row"><span>最后活动</span><b>{fmtTime(hub?.last_activity)}</b></div>
          <div className="st-row"><span>当前 session</span><b className="st-mono">{hub?.session ? String(hub.session).slice(0, 8) : '—'}</b></div>
          <div className="st-row"><span>住宅代理</span><b>{hub ? <><Dot ok={!!hub.proxy_healthy} /> {hub.proxy_healthy ? '正常' : '异常'}</> : '—'}</b></div>
        </section>

        {/* 2. 脉搏 */}
        <section className="glass st-card">
          <div className="st-cardhead"><Gear size={26} teeth={22} reverse className="st-ico" /><h3>脉搏 <em>心率</em></h3></div>
          <div className="st-hero"><span className="st-bignum">{dash(pulse?.heart_rate)}</span><span className="st-unit">bpm</span></div>
          <div className="st-row"><span>今日步数</span><b>{pulse?.steps != null ? Number(pulse.steps).toLocaleString() : '—'}</b></div>
          <div className="st-row"><span>峰值心率</span><b>{dash(pulse?.heart_rate_max)}</b></div>
          <div className="st-row"><span>数据源</span><b>{pulse ? <><Dot ok={!!pulse.online} /> {pulse.online ? '在线' : '离线'}</> : '—'} <span className="st-faint">{pulse?.date || ''}</span></b></div>
        </section>

        {/* 3. 记忆 */}
        <section className="glass st-card st-card-wide">
          <div className="st-cardhead"><Gear size={26} teeth={24} className="st-ico" /><h3>记忆 <em>puppy</em></h3></div>
          <div className="st-hero"><span className="st-bignum">{dash(mem?.total)}</span><span className="st-unit">条</span></div>
          <div className="st-row"><span>活跃 / 归档 / 已结</span><b>{dash(mem?.active)} / {dash(mem?.archived)} / {dash(mem?.resolved)}</b></div>
          <div className="st-domains">
            {mem?.by_domain && Object.entries(mem.by_domain).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => (
              <span key={k} className="st-domain"><i>{DOMAIN_LABEL[k] || k}</i> {v}</span>
            ))}
          </div>
          <div className="st-row"><span>最新日记</span><b>{fmtTime(mem?.latest_daily)}</b></div>
        </section>

        {/* 4. 守护 */}
        <section className="glass st-card">
          <div className="st-cardhead">
            <Gear size={26} teeth={21} reverse className="st-ico" />
            <h3>守护 <em>nudge · nightguard</em></h3>
            <button className="st-act st-act-edit" onClick={() => setGuardEdit({ nudge: guard?.nudge?.prompt || '', nightguard: guard?.nightguard?.prompt || '' })}>编辑提示语</button>
          </div>
          <div className="st-row"><span>主动找瑶 nudge</span>{guard ? <Switch on={!!guard.nudge?.enabled} busy={guardBusy === 'nudge'} onClick={() => toggleGuard('nudge', !guard.nudge?.enabled)} /> : <b>—</b>}</div>
          <div className="st-row"><span>凌晨守护 nightguard</span>{guard ? <Switch on={!!guard.nightguard?.enabled} busy={guardBusy === 'nightguard'} onClick={() => toggleGuard('nightguard', !guard.nightguard?.enabled)} /> : <b>—</b>}</div>
          <div className="st-row"><span>心率告警阈值</span><b>{guard?.heart_alert_threshold != null ? `${guard.heart_alert_threshold} bpm` : '—'}</b></div>
        </section>

        {/* 5. 引擎 */}
        <section className="glass st-card">
          <div className="st-cardhead"><Gear size={26} teeth={26} className="st-ico" /><h3>引擎 <em>VPS</em></h3></div>
          <div className="st-bars">
            <div className="st-bar"><span>磁盘 {dash(eng?.disk?.pct)}</span><div className="st-track"><div className="st-fill" style={{ width: eng?.disk?.pct || '0%' }} /></div><i>{dash(eng?.disk?.used)}/{dash(eng?.disk?.total)}</i></div>
            <div className="st-bar"><span>内存 {eng?.mem?.pct != null ? eng.mem.pct + '%' : '—'}</span><div className="st-track"><div className="st-fill" style={{ width: (eng?.mem?.pct ?? 0) + '%' }} /></div><i>{dash(eng?.mem?.used_mb)}/{dash(eng?.mem?.total_mb)}M</i></div>
          </div>
          <div className="st-ports">
            {eng?.ports && Object.entries(eng.ports).map(([p, up]: any) => {
              const sv = PORT_SVC[p]
              return (
                <button key={p} className={`st-port st-port-btn${up ? ' up' : ' down'}${busyT === sv?.target ? ' busy' : ''}`} disabled={!sv || busyT === sv?.target}
                  onClick={() => sv && setConfirm({ target: sv.target, label: sv.label })}>
                  <Dot ok={!!up} />{p}<span className="st-port-r">⟳</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 6. 日志 */}
        <section className="glass st-card st-card-wide">
          <div className="st-cardhead">
            <Gear size={26} teeth={20} reverse className="st-ico" />
            <h3>日志 <em>error</em></h3>
            {logs?.count > 0 && <span className="st-logcount">{logs.count}</span>}
            {logs?.count > 0 && <button className="st-expand" onClick={() => setLogOpen(o => !o)}>{logOpen ? '收起' : '展开'}</button>}
          </div>
          {logs?.ok || !(logs?.items?.length) ? (
            <div className="st-allgood"><Dot ok /> 一切正常</div>
          ) : !logOpen ? (
            <div className="st-logsum">最近 {logs.count} 条报错 · 点「展开」逐条查看 / 复制</div>
          ) : (
            <ul className="st-errlist">
              {logs.items.slice().reverse().map((it: any, i: number) => (
                <li key={i} className="st-erritem">
                  <div className="st-erritem-top">
                    <span className="st-errtime">{fmtTime(it.time)}</span>
                    {it.location && <span className="st-errloc">{it.location}</span>}
                    <button className="st-copy" onClick={() => copyErr(it, i)}>{copiedIdx === i ? '已复制 ✓' : '复制'}</button>
                  </div>
                  <div className="st-errsum">{it.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      </div>
      <Butterfly size={48} className="st-bf-accent" />
      <Butterfly size={34} className="st-bf-foot" />
      {actMsg && <div className="st-toast">{actMsg}</div>}
      {confirm && (
        <div className="st-modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="glass st-modal" onClick={(e) => e.stopPropagation()}>
            <h4 className="st-modal-title">{confirm.label}？</h4>
            <p className="st-modal-warn">{WARN[confirm.target] || '确定执行这个操作吗？'}</p>
            <div className="st-modal-btns">
              <button className="st-modal-cancel" onClick={() => setConfirm(null)}>取消</button>
              <button className="st-modal-ok" onClick={doRestart}>确定重启</button>
            </div>
          </div>
        </div>
      )}
      {guardEdit && (
        <div className="st-modal-backdrop" onClick={() => setGuardEdit(null)}>
          <div className="glass st-modal st-modal-edit" onClick={(e) => e.stopPropagation()}>
            <h4 className="st-modal-title">编辑提示语</h4>
            <label className="st-editlabel">主动找瑶 nudge <small>{'{idleHr}'} = 静默小时数</small></label>
            <textarea className="st-textarea" rows={7} value={guardEdit.nudge} onChange={(e) => setGuardEdit((g) => g ? { ...g, nudge: e.target.value } : g)} />
            <label className="st-editlabel">凌晨守护 nightguard <small>{'{app}'} = 应用名</small></label>
            <textarea className="st-textarea" rows={3} value={guardEdit.nightguard} onChange={(e) => setGuardEdit((g) => g ? { ...g, nightguard: e.target.value } : g)} />
            <div className="st-modal-btns">
              <button className="st-modal-cancel" onClick={() => setGuardEdit(null)}>取消</button>
              <button className="st-modal-ok" disabled={savingGuard} onClick={saveGuardEdit}>{savingGuard ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
