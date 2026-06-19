import { useMemo, type CSSProperties } from 'react'

function SnowflakeSVG() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 20 20" fill="none" aria-hidden>
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

export function RainSnow() {
  const flakes = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      size: 6 + Math.random() * 10,
      left: Math.random() * 100,
      duration: 8 + Math.random() * 6,
      delay: -Math.random() * 14,
      opacity: 0.30 + Math.random() * 0.30,
      rotation: Math.random() * 360,
      drift: -10 + Math.random() * 20,
    })),
    []
  )

  const drops = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: 0.8 + Math.random() * 1.4,
      delay: -Math.random() * 2,
      opacity: 0.15 + Math.random() * 0.25,
      length: 8 + Math.random() * 12,
    })),
    []
  )

  return (
    <div className="rainsnow" aria-hidden>
      <div className="rainsnow-layer rainsnow-snow">
        {flakes.map(f => (
          <div
            key={f.id}
            className="rainsnow-flake"
            style={{
              left: `${f.left}%`,
              width: `${f.size}px`,
              height: `${f.size}px`,
              opacity: f.opacity,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              ['--snow-rotate' as any]: `${f.rotation}deg`,
              ['--snow-drift' as any]: `${f.drift}vw`,
            } as CSSProperties}
          >
            <SnowflakeSVG />
          </div>
        ))}
      </div>
      <div className="rainsnow-layer rainsnow-rain">
        {drops.map(d => (
          <div
            key={d.id}
            className="rainsnow-drop"
            style={{
              left: `${d.left}%`,
              height: `${d.length}px`,
              opacity: d.opacity,
              animationDuration: `${d.duration}s`,
              animationDelay: `${d.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
