// 浮上来的记忆（2026-10-18 苏煦改：信笺风格）：可以折叠的小卡片。收着时一行「浮上来一条记忆」，左边竖线带情绪色。
// 浮上来的记忆（2026-10-18 苏煦 v3：毛玻璃气泡底 + 面蛸，无蜡烛无丝带无线框）
// 蜡烛备份在 MemoryCard.tsx.bak-20261018-letter 和 memCandle.ts 里，以后想用随时取。
// 情绪色保留 data-emo 属性。面蛸 ᐢ..ᐢ 左下角呼吸。
import { memo } from 'react'

type Hit = { short_id?: string; id?: string; date?: string; summary?: string; keepsake?: boolean; emo?: string }

const NUM = ['', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十']
const md = (d?: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${+m[1]}月${+m[2]}日` : '' }

function view(h: Hit): { text: string; meta: string } | null {
  const s = String(h.summary || '').trim()
  if (!s) return null
  if (h.keepsake) {
    if (/相册·抽屉/.test(s)) return null
    const conch = /^🐚\s*(\d{1,2}月\d{1,2}日)?[^「]*「([\s\S]*)」/u.exec(s)
    if (conch) return { text: `「${conch[2]}」`, meta: [conch[1], '海螺盒'].filter(Boolean).join(' · ') }
    const photo = /^🖼\s*(\d{1,2}月\d{1,2}日)?.*?你当时写的[:：]([^(（]*)/u.exec(s)
    if (photo) return { text: photo[2].trim(), meta: [photo[1], '相册'].filter(Boolean).join(' · ') }
    return { text: s, meta: '' }
  }
  const explore = s.startsWith('↳顺便想起：')
  const text = s.replace(/^↳顺便想起：/, '').replace(/（他自己写下的）$/, '')
  return { text, meta: [md(h.date), explore ? '顺便想起' : ''].filter(Boolean).join(' · ') }
}

export const MemoryCard = memo(function MemoryCard({ hits, rise }: { hits: Hit[]; rise?: boolean }) {
  const rows = hits.flatMap((h, i) => { const v = view(h); return v ? [{ key: `${h.short_id || h.id || ''}:${i}`, emo: h.emo, ...v }] : [] })
  if (!rows.length) return null
  const emo = rows.find(r => r.emo)?.emo
  const metas = rows.map(r => r.meta).filter(Boolean)
  return (
    <details className={`mh-card${rise ? ' rise' : ''}`} data-emo={emo || undefined}>
      <summary>
        <span className="mh-dash" aria-hidden="true" />
        浮上来{NUM[rows.length] ?? rows.length}条记忆
      </summary>
      <div className="mh-body">
        {rows.map(r => <p key={r.key}>{r.text}</p>)}
        <i className="mh-rule" aria-hidden="true" />
        {metas.map((m, i) => <span key={i} className="mh-meta">{m}</span>)}
      </div>
      <span className="mh-octo" aria-hidden="true">ᐢ..ᐢ</span>
    </details>
  )
})
