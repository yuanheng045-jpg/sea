// 通话状态层:轮询来电邀请 + 拨号/接听/挂断 + 语音轮 + 留恋倒计时
// 与 chatStore / apiChat 一样的 useSyncExternalStore 外部 store 模式
import { useSyncExternalStore } from 'react'
import * as ccStore from './chatStore'
import * as apiStore from './apiChat'

export type CallPhase = 'idle' | 'ringing' | 'dialing' | 'connected' | 'lingering' | 'ended'
type Turn = { who: 'her' | 'him'; text: string; ts: number }
type CallState = {
  phase: CallPhase
  channel: 'cc' | 'api' | null
  inviteId: string | null
  reason: string
  conversationId: string | null
  turns: Turn[]
  startedAt: number | null
  lingerSecondsLeft: number
  recording: boolean
  busy: boolean
  speaking: boolean
  lastVolumeHint: number
  error: string | null
}

const IDLE: CallState = {
  phase: 'idle',
  channel: null,
  inviteId: null,
  reason: '',
  conversationId: null,
  turns: [],
  startedAt: null,
  lingerSecondsLeft: 0,
  recording: false,
  busy: false,
  speaking: false,
  lastVolumeHint: 1.0,
  error: null,
}

let s: CallState = { ...IDLE }
const subs = new Set<() => void>()
function emit() { subs.forEach((f) => f()) }
function set(p: Partial<CallState>) { s = { ...s, ...p }; emit() }
function resetIdle(extra?: Partial<CallState>) {
  clearLinger()
  s = { ...IDLE, ...(extra ?? {}) }
  emit()
}

// 当前建议播放音量(她轻声说话则回轻声),供 UI 层朗读时读取
export function getVolumeHint(): number {
  return s.lastVolumeHint
}

// 他的 TTS 正在合成/播放时置真;VAD 据此暂停聆听,避免把他自己的声音录回去(回声闭环)
export function setSpeaking(v: boolean) {
  if (s.speaking !== v) set({ speaking: v })
}

export function useCallState() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f) } },
    () => s,
    () => s,
  )
}

// 取当前 channel 对应的聊天 store(默认走主 cc 通道)
function channelStore(ch: 'cc' | 'api' | null): { sendMessage: (text: string, extra?: any) => void } {
  return ch === 'api' ? apiStore : ccStore
}

// ── 来电轮询(8s 一跳,setTimeout 链避免慢请求与下一跳重叠) ──
let _pollTimer: ReturnType<typeof setTimeout> | null = null
async function pollTick() {
  try {
    if (s.phase === 'idle') {
      const r = await fetch('/api/call/invite', { credentials: 'include' })
        .then((x) => x.json())
        .catch(() => null)
      if (r && s.phase === 'idle') {
        if (r.status === 'pending') {
          set({
            phase: 'ringing',
            inviteId: r.id ?? null,
            reason: r.reason ?? '',
            channel: r.channel === 'api' ? 'api' : 'cc',
            conversationId: r.conversation_id ?? null,
          })
        } else if (r.status === 'expired_just_now') {
          // 未接来电 → 让对应通道的他自然留一句"语音留言"
          try {
            channelStore(r.channel === 'api' ? 'api' : 'cc').sendMessage(
              `〔未接来电〕你刚才打给原瑶的电话没有接听(理由:${r.reason ?? ''}),90秒后自动结束了。现在自然地留一句话,像留言一样,一两句就好,不要机械报告。`,
            )
          } catch {}
        }
      }
    }
  } catch {}
  if (_pollTimer) clearTimeout(_pollTimer)
  _pollTimer = setTimeout(() => { void pollTick() }, 8000)
}
// 模块加载即启动轮询(首跳 2s,之后稳定 8s)
if (_pollTimer) clearTimeout(_pollTimer)
_pollTimer = setTimeout(() => { void pollTick() }, 2000)

// ── 主动拨出 ──
export async function startCall(channel: 'cc' | 'api', conversationId: string | null) {
  if (s.phase !== 'idle') return
  // 必须在她点“拨出”的同一个手势栈里解锁；iOS 不认之后的异步回复。
  unlockCallAudio()
  set({ phase: 'dialing', channel, conversationId, turns: [], error: null })
  try {
    const r = await fetch('/api/call/start', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, conversation_id: conversationId }),
    }).then((x) => x.json())
    if (r && r.id) {
      set({ phase: 'connected', inviteId: r.id, startedAt: Date.now() })
    } else {
      resetIdle({ error: 'start_failed' })
    }
  } catch (e: any) {
    resetIdle({ error: String(e?.message || e) })
  }
}

// ── 接听 ──
export async function acceptCall() {
  if (s.phase !== 'ringing') return
  // 接听点击是来电流程唯一次稳定的用户手势，在任何 await 之前解锁。
  unlockCallAudio()
  const id = s.inviteId
  set({ busy: true })
  try {
    const r = await fetch('/api/call/answer', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'accept' }),
    }).then((x) => x.json())
    if (r && r.ok) {
      set({
        phase: 'connected',
        channel: r.channel === 'api' ? 'api' : 'cc',
        conversationId: r.conversation_id ?? s.conversationId,
        startedAt: Date.now(),
        turns: [],
        busy: false,
      })
    } else {
      resetIdle({ error: 'accept_failed' })
    }
  } catch (e: any) {
    resetIdle({ error: String(e?.message || e) })
  }
}

// ── 拒接(立即回 idle,不等网络;留言非空则也发进对应通道聊天) ──
export async function declineCall(note?: string) {
  if (s.phase !== 'ringing') return
  const id = s.inviteId
  const ch = s.channel
  resetIdle()
  try {
    await fetch('/api/call/answer', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'decline', note }),
    })
  } catch {}
  if (note && note.trim()) {
    try { channelStore(ch).sendMessage(note.trim()) } catch {}
  }
}

// ── 语音轮:按住说话(非连续 VAD,v1 有意简化) ──
let _mediaRecorder: MediaRecorder | null = null
let _chunks: BlobPart[] = []
let _stream: MediaStream | null = null

function stopStream() {
  if (_stream) {
    try { _stream.getTracks().forEach((t) => t.stop()) } catch {}
    _stream = null
  }
}

export async function startRecording() {
  if (s.phase !== 'connected' && s.phase !== 'lingering') return
  if (s.recording) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    _stream = stream
    _chunks = []
    const mr = new MediaRecorder(stream)
    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) _chunks.push(e.data) }
    _mediaRecorder = mr
    mr.start()
    set({ recording: true, error: null })
  } catch (e: any) {
    stopStream()
    _mediaRecorder = null
    set({ recording: false, error: '麦克风打不开:' + String(e?.message || e) })
  }
}

export function stopRecording(): Promise<Blob> {
  return new Promise((resolve) => {
    const mr = _mediaRecorder
    if (!mr) {
      stopStream()
      set({ recording: false })
      resolve(new Blob([], { type: 'audio/webm' }))
      return
    }
    mr.onstop = () => {
      const blob = new Blob(_chunks, { type: 'audio/webm' })
      _chunks = []
      _mediaRecorder = null
      stopStream()
      set({ recording: false })
      resolve(blob)
    }
    try {
      mr.stop()
    } catch {
      _mediaRecorder = null
      stopStream()
      set({ recording: false })
      resolve(new Blob(_chunks, { type: 'audio/webm' }))
    }
  })
}

export async function sendVoiceTurn(blob: Blob) {
  if (s.phase !== 'connected' && s.phase !== 'lingering') return
  // 她开口了 → 若正在留恋倒计时,取消待挂断,回到 connected
  if (s.phase === 'lingering') { clearLinger(); set({ phase: 'connected' }) }
  if (!blob || blob.size === 0) return
  const ch = s.channel
  set({ busy: true })
  try {
    const fd = new FormData()
    fd.append('file', blob, 'turn.webm')
    const r = await fetch('/api/call/transcribe', { method: 'POST', credentials: 'include', body: fd })
      .then((x) => x.json())
      .catch(() => null)
    const text = r && typeof r.text === 'string' ? r.text.trim() : ''
    const tone = r && typeof r.tone === 'string' ? r.tone.trim() : ''
    let vh = r && typeof r.volume_hint === 'number' ? r.volume_hint : 1.0
    if (!(vh >= 0 && vh <= 1)) vh = 1.0
    if (text) {
      set({ turns: [...s.turns, { who: 'her', text, ts: Date.now() }], lastVolumeHint: vh })
      // tone 是声学描述(如"声音很轻"),拼进前缀让他知道她此刻的语气/音量
      const prefix = `[语音通话${tone ? ' · ' + tone : ''}] `
      try { channelStore(ch).sendMessage(prefix + text) } catch {}
      // busy 保持 true,等 UI 层观察到回复流式结束时调 onReplyReady 清掉
    } else {
      set({ busy: false })
    }
  } catch {
    set({ busy: false })
  }
}

// ── 连续语音活动检测(VAD):接通后自动听说,替代"按住说话" ──
// 阈值/时序(RMS 基于时域波形,0~1);数值偏保守,宁可晚触发也不误录
const VAD_START_THRESH = 0.045    // 起录:RMS 超过此值算"有人在说"
const VAD_SUSTAIN_THRESH = 0.030  // 维持:低于此值才算静音
const VAD_START_TICKS = 2         // 连续几个 tick 超阈才起录(~200ms 去抖)
const VAD_SILENCE_MS = 1100       // 尾静音持续这么久 → 判定一句话说完
const VAD_MIN_MS = 400            // 整段太短(<此值)当噪声丢弃
const VAD_MAX_MS = 30000          // 硬上限:录满强制收尾并发送,绝不无限挂着
const VAD_TICK_MS = 100

let _audioCtx: AudioContext | null = null
let _analyser: AnalyserNode | null = null
let _srcNode: MediaStreamAudioSourceNode | null = null
let _vadStream: MediaStream | null = null
let _vadRecorder: MediaRecorder | null = null
let _vadChunks: BlobPart[] = []
let _vadTimer: ReturnType<typeof setInterval> | null = null
let _vadActive = false
let _vadPhase: 'listening' | 'recording' = 'listening'
let _aboveTicks = 0
let _belowMs = 0
let _recStartAt = 0
let _lastTickAt = 0
let _vadData: Uint8Array | null = null

function ensureCallAudioContext(): AudioContext | null {
  if (_audioCtx && _audioCtx.state !== 'closed') return _audioCtx
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null
  _audioCtx = new Ctx()
  return _audioCtx
}

// 拨出/接听点击内同步调用：先排一帧静音再 resume，让 iOS 把这个 context 认成已由用户解锁。
export function unlockCallAudio() {
  try {
    const ctx = ensureCallAudioContext()
    if (!ctx) return
    const silent = ctx.createBufferSource()
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    silent.connect(ctx.destination)
    silent.addEventListener('ended', () => { try { silent.disconnect() } catch {} }, { once: true })
    silent.start()
    if (ctx.state !== 'running') {
      void ctx.resume().catch((e) => console.error('[call] audio unlock failed:', e))
    }
  } catch (e) {
    console.error('[call] audio unlock failed:', e)
  }
}

export type CallAudioPlayback = {
  done: Promise<void>
  stop: () => void
}

// 用通话中已经在运行的 AudioContext 播放 TTS，避开 iOS 对异步 new Audio().play() 的拦截。
// 只借用同一 context 的输出端，不改录音、VAD 或麦克风节点。
export async function startCallAudioPlayback(blob: Blob, volume = 1): Promise<CallAudioPlayback> {
  const ctx = _audioCtx
  if (!ctx || ctx.state === 'closed') throw new Error('call audio context unavailable')
  if (ctx.state !== 'running') await ctx.resume()

  const encoded = await blob.arrayBuffer()
  const decoded = await ctx.decodeAudioData(encoded)
  if (_audioCtx !== ctx) throw new Error('call audio context ended')

  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = decoded
  gain.gain.value = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1))
  source.connect(gain)
  gain.connect(ctx.destination)

  let settled = false
  let finish!: () => void
  const done = new Promise<void>((resolve) => {
    finish = () => {
      if (settled) return
      settled = true
      try { source.disconnect() } catch {}
      try { gain.disconnect() } catch {}
      resolve()
    }
  })
  source.addEventListener('ended', finish, { once: true })
  source.start()

  return {
    done,
    stop: () => {
      if (settled) return
      try { source.stop() } catch {}
      finish()
    },
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function beginVadRecording(now: number) {
  if (!_vadStream) return
  _vadChunks = []
  try {
    const mr = new MediaRecorder(_vadStream)
    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) _vadChunks.push(e.data) }
    _vadRecorder = mr
    mr.start()
  } catch {
    _vadRecorder = null
    return
  }
  _vadPhase = 'recording'
  _recStartAt = now
  _belowMs = 0
  set({ recording: true })
}

function finishVadRecording(now: number) {
  const mr = _vadRecorder
  const durMs = now - _recStartAt
  _vadRecorder = null
  _vadPhase = 'listening'
  _aboveTicks = 0
  _belowMs = 0
  set({ recording: false })
  if (!mr) return
  mr.onstop = () => {
    const blob = new Blob(_vadChunks, { type: 'audio/webm' })
    _vadChunks = []
    // 太短当噪声丢弃;够长才走既有发送链路
    if (durMs >= VAD_MIN_MS && blob.size > 0) void sendVoiceTurn(blob)
  }
  try { mr.stop() } catch { _vadChunks = [] }
}

function vadTick() {
  if (!_vadActive || !_analyser || !_vadData) return
  const now = nowMs()
  const dt = _lastTickAt ? now - _lastTickAt : VAD_TICK_MS
  _lastTickAt = now
  _analyser.getByteTimeDomainData(_vadData as any)
  let sum = 0
  for (let i = 0; i < _vadData.length; i++) { const v = (_vadData[i] - 128) / 128; sum += v * v }
  const rms = Math.sqrt(sum / _vadData.length)
  if (_vadPhase === 'listening') {
    // 他在想/在说时不聆听;通话已不在活跃相位也不聆听
    if (s.busy || s.speaking) { _aboveTicks = 0; return }
    if (s.phase !== 'connected' && s.phase !== 'lingering') { _aboveTicks = 0; return }
    if (rms >= VAD_START_THRESH) {
      _aboveTicks++
      if (_aboveTicks >= VAD_START_TICKS) beginVadRecording(now)
    } else {
      _aboveTicks = 0
    }
  } else {
    if (rms >= VAD_SUSTAIN_THRESH) _belowMs = 0
    else _belowMs += dt
    if ((now - _recStartAt) >= VAD_MAX_MS || _belowMs >= VAD_SILENCE_MS) finishVadRecording(now)
  }
}

// 接通后启动一次:持有麦克风流,分析音量驱动自动录音(幂等,重复调用忽略)
export async function startVad() {
  if (_vadActive) return
  if (s.phase !== 'connected' && s.phase !== 'lingering') return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // await 期间可能已挂断,或已有另一次 startVad 抢先初始化(StrictMode 双触发)
    if (_vadActive || (s.phase !== 'connected' && s.phase !== 'lingering')) {
      try { stream.getTracks().forEach((t) => t.stop()) } catch {}
      return
    }
    const ctx = ensureCallAudioContext()
    if (!ctx) { try { stream.getTracks().forEach((t) => t.stop()) } catch {}; return }
    if (ctx.state !== 'running') await ctx.resume()
    _vadStream = stream
    _srcNode = ctx.createMediaStreamSource(stream)
    _analyser = ctx.createAnalyser()
    _analyser.fftSize = 1024
    _analyser.smoothingTimeConstant = 0.4
    _srcNode.connect(_analyser)
    _vadData = new Uint8Array(_analyser.fftSize)
    _vadPhase = 'listening'
    _aboveTicks = 0
    _belowMs = 0
    _lastTickAt = 0
    _vadActive = true
    if (_vadTimer) clearInterval(_vadTimer)
    _vadTimer = setInterval(() => { try { vadTick() } catch {} }, VAD_TICK_MS)
    set({ error: null })
  } catch (e: any) {
    stopVad()
    set({ error: '麦克风打不开:' + String(e?.message || e) })
  }
}

// 手动提前收尾当前这段(她觉得"听过头了")
export function stopVadEarly() {
  if (_vadPhase === 'recording') finishVadRecording(nowMs())
}

// 挂断/卸载时彻底清理:计时器、录音器、分析节点、AudioContext、麦克风流,避免跨通话泄漏
export function stopVad() {
  _vadActive = false
  if (_vadTimer) { clearInterval(_vadTimer); _vadTimer = null }
  const mr = _vadRecorder
  _vadRecorder = null
  if (mr) { try { mr.onstop = null } catch {}; try { mr.stop() } catch {} }
  _vadChunks = []
  try { _srcNode?.disconnect() } catch {}
  try { _analyser?.disconnect() } catch {}
  _srcNode = null
  _analyser = null
  _vadData = null
  if (_audioCtx) { try { void _audioCtx.close() } catch {}; _audioCtx = null }
  if (_vadStream) { try { _vadStream.getTracks().forEach((t) => t.stop()) } catch {}; _vadStream = null }
  _vadPhase = 'listening'
  _aboveTicks = 0
  _belowMs = 0
  if (s.recording) set({ recording: false })
}

// 从回复文本里剥掉通话标记(⟪挂断⟫/⟪拨号:..⟫/⟪勿扰开⟫ 等,含《》【】[] 变体),用于展示与朗读
const CALL_MARKER_RE = /[⟪《【\[]\s*(?:拨号|dial|挂断|hangup|勿扰开|勿扰关|dnd)[^⟫》】\]]*[⟫》】\]]/gi
export function stripCallMarkers(text: string): string {
  return (text || '').replace(CALL_MARKER_RE, '').replace(/[ \t]{2,}/g, ' ').trim()
}

// UI 层(CallOverlay)观察到助手语音轮回复完成后调用:落他这一轮 + 判断挂断意图
export function onReplyReady(text: string) {
  const active = s.phase === 'connected' || s.phase === 'lingering'
  const raw = text || ''
  const hangupIntent = /[⟪《【\[]\s*(?:挂断|hangup)\s*[⟫》】\]]/i.test(raw)
  const clean = stripCallMarkers(raw)
  if (active) {
    if (clean) set({ turns: [...s.turns, { who: 'him', text: clean, ts: Date.now() }], busy: false })
    else set({ busy: false })
    if (hangupIntent) beginLingering()
  } else {
    set({ busy: false })
  }
}

// ── 留恋倒计时(他说了挂断意图,但先留 18s;她再开口即取消) ──
let _lingerTimer: ReturnType<typeof setInterval> | null = null
function clearLinger() {
  if (_lingerTimer) { clearInterval(_lingerTimer); _lingerTimer = null }
}
function beginLingering() {
  clearLinger()
  set({ phase: 'lingering', lingerSecondsLeft: 18 })
  _lingerTimer = setInterval(() => {
    if (s.phase !== 'lingering') { clearLinger(); return }
    const left = s.lingerSecondsLeft - 1
    if (left <= 0) {
      clearLinger()
      set({ lingerSecondsLeft: 0 })
      void hangup()
    } else {
      set({ lingerSecondsLeft: left })
    }
  }, 1000)
}

// ── 挂断 ──
export async function hangup() {
  if (s.phase === 'idle' || s.phase === 'ended') return
  clearLinger()
  stopVad()
  const id = s.inviteId
  const startedAt = s.startedAt
  const duration_s = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0
  stopStream()
  _mediaRecorder = null
  set({ phase: 'ended', recording: false, busy: false })
  // >=20s 才带上逐轮记录,后端用快速小模型服务端生成一句总结落库(不占人格的一轮)
  const transcript = duration_s >= 20 ? s.turns.map((t) => ({ who: t.who, text: t.text })) : undefined
  try {
    await fetch('/api/call/end', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, duration_s, ...(transcript ? { transcript } : {}) }),
    })
  } catch {}
  // ~1.6s 后整体复位回 idle,浮层消失、轮询恢复
  setTimeout(() => { resetIdle() }, 1600)
}
