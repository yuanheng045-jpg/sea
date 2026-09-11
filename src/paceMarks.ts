// paceMarks.ts — 消息级情绪档位（2026-09-09，苏煦的需求二）
//
// 苏煦在回复最开头埋 <!--pace:slow--> / <!--pace:fast--> 决定这条消息在屏幕上浮现的速度。
// 铁律：一条消息只有一个档、严禁句中变速；无标记 = 默认档。
// 标记在缓冲池入口（PaceScanner.feed）剥掉，绝不会被逐字渲染；最终渲染/历史/复制走 stripPaceMarks。
// hub-print 的 streamFilter 对未知注释是"放行"的，所以标记会原样（可能被切成几段）流到前端；
// 剥离在这里做。思维链不走这套。
import type { Pace } from './weir'

export type PaceName = 'default' | 'slow' | 'fast'

// 每档只定四个数：字速上限、淡入时长、句末呼吸停顿、句中小停顿；其余机制不动。
// 2026-09-09 晚原瑶拍板「从容」：默认档限速——屏幕故意落后网络、像有人在慢慢写；句中匀速不做起伏。
// 先定 26 字/秒，她看了说"中间匀速，但是慢点"，降到 20；淡入 420ms 让同时在浮现的字数保持在八九个（再长就发雾）。
// 句末淡入自动 ×5/3。
export const PACES: Record<PaceName, Required<Pace>> = {
  default: { maxCps: 20, fadeMs: 420, endPause: 150, clausePause: 80 },   // 从容
  slow: { maxCps: 12, fadeMs: 540, endPause: 220, clausePause: 110 },     // 低语档：深夜、脆弱、告白
  fast: { maxCps: 45, fadeMs: 200, endPause: 70, clausePause: 30 },       // 疾速档：急、拦、情绪冲
}

const PACE_MARK = /^<!--\s*pace\s*:\s*([a-z]+)\s*-->$/i
const PACE_ANY = /<!--\s*pace\s*:\s*[a-z]*\s*-->/gi
const HEAD_MARK = /^\s*<!--\s*pace\s*:\s*[a-z]*\s*-->\s*/i
const MAX_MARK = 40   // 标记最长也就 20 来个字符；扣住的疑似标记超过这个长度就当普通文字放行

/** 未知档位一律按默认档。 */
export function parsePace(v: string | undefined | null): PaceName {
  const k = String(v ?? '').toLowerCase()
  return k === 'slow' || k === 'fast' ? k : 'default'
}

/** 从整条文本里去掉 pace 标记（开头的连同其后的空白一起去，别处的只去标记本身）。 */
export function stripPaceMarks(text: string): string {
  if (!text || text.indexOf('<!--') === -1) return text
  return text.replace(HEAD_MARK, '').replace(PACE_ANY, '')
}

/** 只认开头的标记（前面可有空白），返回档位；没有则 null。 */
export function headPace(text: string): PaceName | null {
  const m = /^\s*<!--\s*pace\s*:\s*([a-z]+)\s*-->/i.exec(text || '')
  return m ? parsePace(m[1]) : null
}

/**
 * 流式入口的标记扫描器：逐块喂 delta，吐出可以直接进排字器的干净文字。
 * · 疑似标记开头（"<"、"<!-"、"<!--pa"…）先扣住，凑齐再判；不是标记就原样放行
 * · 只认还没有任何可见文字之前出现的标记（= 消息开头）；后面出现的只剥不认
 * · 开头（第一个可见字之前）的空白一并吃掉，免得段落以空行开场
 */
export class PaceScanner {
  private pending = ''
  private sawText = false
  pace: PaceName | null = null

  feed(chunk: string): { text: string; pace: PaceName | null } {
    let buf = this.pending + (chunk ?? '')
    this.pending = ''
    let out = ''
    let found: PaceName | null = null
    while (buf) {
      const i = buf.indexOf('<')
      if (i === -1) { out += buf; buf = ''; break }
      out += buf.slice(0, i); buf = buf.slice(i)
      if (buf.length < 4) {
        if ('<!--'.startsWith(buf)) { this.pending = buf; buf = ''; break }   // 可能是注释开头，扣住
        out += buf[0]; buf = buf.slice(1); continue
      }
      if (!buf.startsWith('<!--')) { out += buf[0]; buf = buf.slice(1); continue }
      const close = buf.indexOf('-->')
      if (close === -1) {
        if (buf.length > MAX_MARK) { out += buf[0]; buf = buf.slice(1); continue }   // 太长，不是我们的标记
        this.pending = buf; buf = ''; break                                           // 标记没吐完，扣住
      }
      const full = buf.slice(0, close + 3)
      buf = buf.slice(close + 3)
      const m = PACE_MARK.exec(full)
      if (m) {
        // 只认消息开头的那个：之前（含本块已放行的部分）不能有可见文字
        if (!this.sawText && !/\S/.test(out) && this.pace === null) { this.pace = parsePace(m[1]); found = this.pace }
        continue                                                                    // 无论认不认，都剥掉
      }
      out += full                                                                   // 别的注释：原样放行
    }
    if (!this.sawText) out = out.replace(/^\s+/, '')
    if (/\S/.test(out)) this.sawText = true
    return { text: out, pace: found }
  }

  /** 流结束：扣住的半截不是标记，按普通文字放出来。 */
  end(): string {
    const rest = this.pending
    this.pending = ''
    if (!this.sawText) return rest.replace(/^\s+/, '')
    return rest
  }
}
