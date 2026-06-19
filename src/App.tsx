import { useState } from 'react'
import { Home } from './Home'
import { ThemePanel } from './ThemePanel'

export type Page = 'cc' | 'home' | 'page2' | 'api' | 'voice' | 'reading' | 'play'

export function App() {
  const [page, setPage] = useState<Page>('home')

  return (
    <div className="app">
      <div className="bg-layer">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>
      <div className="content-scroll">
        {page === 'home'  && <Home onNavigate={setPage} />}
        {page === 'page2' && <ThemePanel />}
        {page !== 'home' && page !== 'page2' && (
          <div className="empty-page">
            <span className="empty-label">{page}</span>
            <button className="back-btn glass" onClick={() => setPage('home')}>
              ← 返回首页
            </button>
          </div>
        )}
      </div>
      <nav className="dock">
        <button
          className={`dock-edge${page === 'cc' ? ' active' : ''}`}
          onClick={() => setPage('cc')}
        >
          <div className="img-slot img-dock">CC</div>
        </button>
        <div className="dock-pill">
          <button
            className={`dock-mid${page === 'home' ? ' active' : ''}`}
            onClick={() => setPage('home')}
          >🏠</button>
          <button
            className={`dock-mid${page === 'page2' ? ' active' : ''}`}
            onClick={() => setPage('page2')}
          >☰</button>
        </div>
        <button
          className={`dock-edge${page === 'api' ? ' active' : ''}`}
          onClick={() => setPage('api')}
        >
          <div className="img-slot img-dock">API</div>
        </button>
      </nav>
    </div>
  )
}
