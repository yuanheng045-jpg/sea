import type { Page } from './App'

export function GardenFrame({ onBack }: { onBack: (p: Page) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#faf8f5' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 14px 10px', borderBottom: '1px solid #eee7dc', flex: '0 0 auto' }}>
        <button onClick={() => onBack('home')} style={{ border: 'none', background: 'none', fontSize: 20, color: '#8a8071', cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#6b6258' }}>秘密花园</span>
      </div>
      <iframe src="/mem3/garden" title="秘密花园" style={{ flex: 1, width: '100%', border: 'none' }} />
    </div>
  )
}
