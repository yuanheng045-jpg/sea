import { useState, useRef } from 'react'
import { Home } from './Home'
import { ThemePanel } from './ThemePanel'
import { IconSlot } from './IconSlot'
import { RainSnow } from './RainSnow'
import { Fireplace } from './Fireplace'
import { CCPage } from './CCPage'

export type Page = 'cc' | 'home' | 'page2' | 'api' | 'voice' | 'reading' | 'play'

export function App() {
  const [page, setPage] = useState<Page>('home')
  const pillStartX = useRef<number | null>(null)
  const swipedRef = useRef(false)

  const onPillPointerDown = (e: React.PointerEvent) => {
    pillStartX.current = e.clientX
    swipedRef.current = false
  }
  const onPillPointerUp = (e: React.PointerEvent) => {
    if (pillStartX.current === null) return
    const dx = e.clientX - pillStartX.current
    pillStartX.current = null
    if (Math.abs(dx) > 30) {
      swipedRef.current = true
      if (dx < 0 && page === 'home') setPage('page2')
      else if (dx > 0 && page === 'page2') setPage('home')
    }
  }
  const onPillClickCapture = (e: React.MouseEvent) => {
    if (swipedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      swipedRef.current = false
    }
  }

  return (
    <div className="app">
      <div className="bg-layer">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>
      <RainSnow />
      <div className="content-scroll">
        {page === 'home'  && <Home onNavigate={setPage} />}
        {page === 'page2' && <ThemePanel />}
        {page === 'cc'    && <CCPage onBack={() => setPage('home')} />}
        {page !== 'home' && page !== 'page2' && page !== 'cc' && (
          <div className="empty-page">
            <span className="empty-label">{page}</span>
          </div>
        )}
      </div>
      {page !== 'cc' && (
      <nav className="dock">
        <button
          className="dock-edge"
          onClick={() => setPage('cc')}
        >
          <IconSlot iconKey="cc" fallback={<span className="dock-letters">CC</span>} className="img-dock" />
        </button>
        <div
          className="dock-pill"
          onPointerDown={onPillPointerDown}
          onPointerUp={onPillPointerUp}
          onClickCapture={onPillClickCapture}
        >
          <button
            className={`dock-mid${page === 'home' ? ' active' : ''}`}
            onClick={() => setPage('home')}
          ><Fireplace /></button>
          <button
            className={`dock-mid${page === 'page2' ? ' active' : ''}`}
            onClick={() => setPage('page2')}
          >☰</button>
        </div>
        <button
          className={`dock-edge${page === 'api' ? ' active' : ''}`}
          onClick={() => setPage('api')}
        >
          <IconSlot iconKey="api" fallback={<span className="dock-letters">API</span>} className="img-dock" />
        </button>
      </nav>
      )}
    </div>
  )
}
