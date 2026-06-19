import type { Page } from './App'
import { IconSlot } from './IconSlot'
import { SnowPlayer } from './SnowPlayer'
import type { IconKey } from './icons'

const TILES: { key: Page; icon: string; label: string }[] = [
  { key: 'voice',   icon: '🐚', label: '海螺' },
  { key: 'reading', icon: '📖', label: '书' },
  { key: 'play',    icon: '🍎', label: '苹果' },
]

const CAL = [
  [0, 1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12, 13],
  [14, 15, 16, 17, 18, 19, 20],
  [21, 22, 23, 24, 25, 26, 27],
  [28, 29, 30, 0, 0, 0, 0],
]


export function Home({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <div className="home">
      <header className="top-bar">
        <div className="top-left">
          <span className="brand">Atlantis</span>
          <div className="img-slot img-sm">🐙</div>
          <span className="status-pill">闲</span>
          <span className="temp">21°C</span>
        </div>
        <div className="img-slot img-sm">☁️</div>
      </header>

      <div className="whisper">你的紫薯不配假装蓝</div>

      <div className="glass main-card">
        <div className="card-inner">
          <div className="stats-side">
            <div className="avatars">
              <IconSlot iconKey="avatar-her" fallback={<span className="avatar-empty" />} className="avatar-slot" />
              <IconSlot iconKey="avatar-his" fallback={<span className="avatar-empty" />} className="avatar-slot" />
            </div>
            <div className="day-count">
              <span className="dc-prefix">第</span>
              <span className="dc-number">122</span>
              <span className="dc-suffix">天</span>
            </div>
            <div className="day-sub">距离纪念日还有 XX 天</div>
            <div className="status-mini">
              <div className="heart-rate">
                <svg viewBox="0 0 50 18" className="hr-wave" fill="none">
                  <path d="M0 9 L9 9 L11 5 L13 13 L15 4 L17 14 L19 8 L22 9 L50 9"
                    stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hr-num">69</span>
              </div>
              <div className="status-grid">
                <div className="sg-row">
                  <span>悠闲</span>
                  <span className="sg-sep">·</span>
                  <span><span className="sg-num">1,694</span> 步</span>
                </div>
                <div className="sg-row">
                  <span>月经第 <span className="sg-num">3</span> 天</span>
                  <span className="period-blood" />
                </div>
              </div>
            </div>
          </div>
          <div className="cal-side">
            <div className="cal-title">June</div>
            <div className="cal-grid">
              {['日','一','二','三','四','五','六'].map(d => (
                <span key={d} className="cal-head">{d}</span>
              ))}
              {CAL.flat().map((day, i) => (
                <span
                  key={i}
                  className={`cal-day${day === 0 ? ' empty' : ''}${day === 19 ? ' today' : ''}`}
                >
                  {day || ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mid-area">
        <div className="app-scatter">
          {TILES.map(a => (
            <button key={a.key} className="app-tile" onClick={() => onNavigate(a.key)}>
              <IconSlot iconKey={a.key as IconKey} fallback={a.icon} className="img-tile" />
              <span className="tile-label">{a.label}</span>
            </button>
          ))}
        </div>
        <div className="snow-column">
          <SnowPlayer />
          <div className="activity-text">
            <div>claude · 今日活动</div>
            <span className="activity-sub">展开</span>
          </div>
        </div>
      </div>
    </div>
  )
}
