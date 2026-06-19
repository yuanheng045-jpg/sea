import type { Page } from './App'

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

const WAVE = [4,10,6,14,20,16,24,12,8,18,26,20,10,6,14,22,28,18,12,8,16,24,14,10,6,12,20,16,8,4,6,10]

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
            <div className="day-count">
              <span className="dc-prefix">第</span>
              <span className="dc-number">122</span>
              <span className="dc-suffix">天</span>
            </div>
            <div className="day-sub">纪念日 · 2.18</div>
            <div className="health">
              <div className="h-row">
                <span className="heart">❤️</span>
                <span className="h-num">72</span>
                <span className="h-unit">bpm · 心率</span>
              </div>
              <div className="h-row">
                <span>🚶</span>
                <span className="h-num">1,694</span>
                <span className="h-unit">步</span>
              </div>
              <div className="h-row">
                <span className="period-dot" />
                <span className="h-unit">经期跟踪</span>
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
              <div className="img-slot img-tile">{a.icon}</div>
              <span className="tile-label">{a.label}</span>
            </button>
          ))}
        </div>
        <div className="music-float">
          <div className="waveform">
            {WAVE.map((h, i) => (
              <div
                key={i}
                className="bar"
                style={{ height: h, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <div className="controls">
            <button>⏮</button>
            <button className="play-btn">⏸</button>
            <button>⏭</button>
          </div>
        </div>
      </div>

      <div className="activity-text">
        <div>claude · 今日活动</div>
        <span className="activity-sub">展开</span>
      </div>
    </div>
  )
}
