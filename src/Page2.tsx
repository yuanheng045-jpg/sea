import type { Page } from './App'
import { AppCanvas, type AppDef } from './AppCanvas'

const APPS: AppDef[] = [
  { key: 'theme', iconKey: 'theme', icon: '🎨', label: '主题', def: { x: 26, y: 22 } },
  { key: 'status', iconKey: 'status', icon: '⚙️', label: '状态', def: { x: 64, y: 30 } },
]

export function Page2({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <div className="home page2-home">
      <header className="top-bar">
        <div className="top-left">
          <span className="brand">Atlantis</span>
        </div>
        <span className="weather-icon">☁️</span>
      </header>
      <AppCanvas apps={APPS} onNavigate={onNavigate} />
    </div>
  )
}
