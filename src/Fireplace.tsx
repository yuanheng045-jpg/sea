export function Fireplace() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="fireplace" aria-hidden>
      <defs>
        <filter id="fp-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.6" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* 拱形炉口 白 */}
      <path d="M3 20 L3 11 Q3 5 12 5 Q21 5 21 11 L21 20 Z"
            fill="none" stroke="rgba(30,30,30,0.85)" strokeWidth="1.4" strokeLinejoin="round"/>
      {/* 壁炉地板 白 */}
      <rect x="2.5" y="19.5" width="19" height="1.4" rx="0.4" fill="rgba(30,30,30,0.7)" />
      {/* 柴 白 */}
      <rect x="7" y="17.2" width="10" height="1.4" rx="0.6" fill="rgba(60,40,30,0.6)" />
      {/* 火焰组：蓝色三层 + 发光模糊 */}
      <g filter="url(#fp-glow)">
        <ellipse className="fp-outer" cx="12" cy="13" rx="3.5" ry="5"
                 fill="rgba(140,180,255,0.5)" />
        <ellipse className="fp-mid" cx="12" cy="14" rx="2.2" ry="3.5"
                 fill="rgba(80,140,240,0.78)" />
        <ellipse className="fp-inner" cx="12" cy="15" rx="1" ry="2"
                 fill="rgba(30,90,200,0.95)" />
      </g>
    </svg>
  )
}
