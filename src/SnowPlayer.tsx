import { useState, useMemo, type CSSProperties } from 'react'

function SnowflakeSVG() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="1" fill="white" opacity="0.8"/>
      <line x1="10" y1="2" x2="10" y2="18" stroke="white" strokeWidth="0.6" opacity="0.7"/>
      <line x1="3.07" y1="6" x2="16.93" y2="14" stroke="white" strokeWidth="0.6" opacity="0.7"/>
      <line x1="16.93" y1="6" x2="3.07" y2="14" stroke="white" strokeWidth="0.6" opacity="0.7"/>
      <line x1="10" y1="4" x2="8" y2="6" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <line x1="10" y1="4" x2="12" y2="6" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <line x1="10" y1="16" x2="8" y2="14" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <line x1="10" y1="16" x2="12" y2="14" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <line x1="5" y1="7" x2="5" y2="9.5" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <line x1="5" y1="7" x2="7" y2="7.5" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <line x1="15" y1="13" x2="15" y2="10.5" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <line x1="15" y1="13" x2="13" y2="12.5" stroke="white" strokeWidth="0.4" opacity="0.5"/>
      <circle cx="10" cy="2" r="0.6" fill="white" opacity="0.5"/>
      <circle cx="10" cy="18" r="0.6" fill="white" opacity="0.5"/>
      <circle cx="3.07" cy="6" r="0.6" fill="white" opacity="0.5"/>
      <circle cx="16.93" cy="6" r="0.6" fill="white" opacity="0.5"/>
      <circle cx="3.07" cy="14" r="0.6" fill="white" opacity="0.5"/>
      <circle cx="16.93" cy="14" r="0.6" fill="white" opacity="0.5"/>
    </svg>
  )
}

function IconPrev({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="3.5" width="1.5" height="9" rx="0.5" />
      <path d="M14 3 L6 8 L14 13 Z" />
    </svg>
  )
}

function IconNext({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3 L10 8 L2 13 Z" />
      <rect x="11.5" y="3.5" width="1.5" height="9" rx="0.5" />
    </svg>
  )
}

function IconPlay({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3 L13 8 L4 13 Z" />
    </svg>
  )
}

function IconPause({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="3" width="2.8" height="10" rx="0.5" />
      <rect x="9.2" y="3" width="2.8" height="10" rx="0.5" />
    </svg>
  )
}

export function SnowPlayer() {
  const [playing, setPlaying] = useState(true)

  const flakes = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      size: 3 + Math.random() * 5,
      left: Math.random() * 100,
      duration: 1.5 + Math.random() * 2,
      delay: Math.random() * 3,
      opacity: 0.4 + Math.random() * 0.3,
      rotation: Math.random() * 360,
    })),
    []
  )

  return (
    <div className={`snow-player glass${playing ? '' : ' paused'}`}>
      <div className="snow-layer">
        {flakes.map(f => (
          <div
            key={f.id}
            className="snowflake"
            style={{
              left: `${f.left}%`,
              width: `${f.size}px`,
              height: `${f.size}px`,
              opacity: f.opacity,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              ['--snow-rotate' as any]: `${f.rotation}deg`,
            } as CSSProperties}
          >
            <SnowflakeSVG />
          </div>
        ))}
      </div>
      <div className="snow-row">
        <div className="snow-controls">
          <button className="snow-btn" aria-label="prev"><IconPrev /></button>
          <button
            className="snow-btn play"
            onClick={() => setPlaying(p => !p)}
            aria-label={playing ? 'pause' : 'play'}
          >
            {playing ? <IconPause size={15} /> : <IconPlay size={15} />}
          </button>
          <button className="snow-btn" aria-label="next"><IconNext /></button>
        </div>
        <div className="snow-progress">
          <div className="snow-progress-fill" />
          <div className="snow-progress-thumb" />
        </div>
        <span className="snow-time">1:23</span>
      </div>
      <div className="snow-meta">saudade · Ólafur Arnalds</div>
    </div>
  )
}
