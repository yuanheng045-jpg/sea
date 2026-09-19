import type { Page } from './App'

// T-65：棋牌室从「开新 tab 外链」改成 sea 内嵌 iframe，不离开 sea；key 沿用 T-64，见 qipai/.env QIPAI_HOME_KEY
export function QipaiFrame({ onBack }: { onBack: (p: Page) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#eef1f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 14px 10px', borderBottom: '1px solid #dde3ee', flex: '0 0 auto' }}>
        <button onClick={() => onBack('home')} style={{ border: 'none', background: 'none', fontSize: 20, color: '#7c8598', cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#4c5566' }}>棋牌室</span>
      </div>
      <iframe
        src="/cc-api/qipai/?key=44e59c4c4c96f4bb1a5242e042cb08ac15fcffc94394598d"
        title="棋牌室"
        style={{ flex: 1, width: '100%', border: 'none' }}
      />
    </div>
  )
}
