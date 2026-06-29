import { useState, useRef, useEffect } from 'react'
import { Home } from './Home'
import { ThemePanel } from './ThemePanel'
import { IconSlot } from './IconSlot'
import { RainSnow } from './RainSnow'
import { Fireplace } from './Fireplace'
import { CCPage } from './CCPage'
import { Page2 } from './Page2'
import { StatusPage } from './StatusPage'
import './appearance'  // 启动时 apply 外观偏好

export type Page = 'cc' | 'home' | 'page2' | 'theme' | 'status' | 'api' | 'voice' | 'reading' | 'play'

export function App() {
  const [page, setPage] = useState<Page>('home')

  // 省电：页面不可见 / 3 分钟无交互 → body[data-power-save] → CSS 全局暂停动画
  useEffect(() => {
    let idleTimer: number | null = null
    const IDLE_MS = 3 * 60 * 1000
    const enter = () => document.body.setAttribute('data-power-save', 'true')
    const exit = () => document.body.removeAttribute('data-power-save')
    const reset = () => {
      exit()
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = window.setTimeout(enter, IDLE_MS)
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        enter()
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
      } else { reset() }
    }
    reset()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('touchstart', reset, { passive: true })
    window.addEventListener('mousemove', reset, { passive: true })
    window.addEventListener('keydown', reset)
    window.addEventListener('scroll', reset, { passive: true } as any)
    return () => {
      if (idleTimer) clearTimeout(idleTimer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('touchstart', reset)
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
      window.removeEventListener('scroll', reset)
    }
  }, [])
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
      <div className="chat-bg-color" aria-hidden />
      <div className="chat-bg-img" aria-hidden />
      <div className="chat-bg-dim" aria-hidden />
      <RainSnow />
      <div className="content-scroll">
        {page === 'home'  && <Home onNavigate={setPage} />}
        {page === 'page2' && <Page2 onNavigate={setPage} />}
        {page === 'theme' && <ThemePanel onBack={() => setPage('page2')} />}
        {page === 'status' && <StatusPage onBack={() => setPage('page2')} />}
        {page === 'cc'    && <CCPage onBack={() => setPage('home')} onNavigate={setPage} />}
        {page !== 'home' && page !== 'page2' && page !== 'theme' && page !== 'status' && page !== 'cc' && (
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
