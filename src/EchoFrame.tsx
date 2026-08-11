import type { Page } from './App'

export function EchoFrame({ onBack }: { onBack: (p: Page) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#090b12' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 14px 10px', borderBottom: '1px solid #24293a', flex: '0 0 auto' }}>
        <button onClick={() => onBack('home')} style={{ border: 'none', background: 'none', fontSize: 20, color: '#777d91', cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#a9abc0' }}>回声</span>
      </div>
      <iframe src="/mem3/echo/" title="回声" style={{ flex: 1, width: '100%', border: 'none' }} />
    </div>
  )
}
