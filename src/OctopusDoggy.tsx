export function OctopusDoggy() {
  return (
    <svg width="44" height="24" viewBox="0 0 56 30" className="octopus-doggy" aria-hidden>
      <rect x="11" y="15" width="2" height="8" rx="1" fill="rgba(74,140,199,.15)" transform="rotate(-6 12 15)">
        <animate attributeName="transform" values="rotate(-6 12 15);rotate(4 12 15);rotate(-6 12 15)" dur="3s" repeatCount="indefinite"/>
      </rect>
      <rect x="14" y="15" width="2" height="9" rx="1" fill="rgba(74,140,199,.15)">
        <animate attributeName="transform" values="rotate(2 15 15);rotate(-5 15 15);rotate(2 15 15)" dur="3.4s" repeatCount="indefinite"/>
      </rect>
      <rect x="17" y="15" width="2" height="8" rx="1" fill="rgba(74,140,199,.15)">
        <animate attributeName="transform" values="rotate(0 18 15);rotate(-3 18 15);rotate(0 18 15)" dur="2.8s" repeatCount="indefinite"/>
      </rect>
      <rect x="20" y="15" width="2" height="9" rx="1" fill="rgba(74,140,199,.15)">
        <animate attributeName="transform" values="rotate(-2 21 15);rotate(5 21 15);rotate(-2 21 15)" dur="3.2s" repeatCount="indefinite"/>
      </rect>
      <rect x="23" y="15" width="2" height="7" rx="1" fill="rgba(74,140,199,.15)">
        <animate attributeName="transform" values="rotate(4 24 15);rotate(-3 24 15);rotate(4 24 15)" dur="3.5s" repeatCount="indefinite"/>
      </rect>
      <ellipse cx="18" cy="10" rx="8" ry="7" fill="rgba(74,140,199,.18)"/>
      <circle cx="15" cy="9" r="1.5" fill="rgba(74,140,199,.35)"/>
      <circle cx="21" cy="9" r="1.5" fill="rgba(74,140,199,.35)"/>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0;-1.5,0;0,0" dur="4s" repeatCount="indefinite"/>
        <ellipse cx="40" cy="20" rx="7" ry="5" fill="rgba(196,149,106,.18)"/>
        <circle cx="35" cy="14" r="5" fill="rgba(196,149,106,.2)"/>
        <ellipse cx="31.5" cy="10" rx="2" ry="3.5" fill="rgba(196,149,106,.13)" transform="rotate(-10 31.5 10)"/>
        <ellipse cx="38" cy="10" rx="2" ry="3.5" fill="rgba(196,149,106,.13)" transform="rotate(10 38 10)"/>
        <circle cx="34" cy="15" r="1" fill="rgba(140,100,60,.3)"/>
        <ellipse cx="33" cy="17" rx="1.2" ry="0.8" fill="rgba(140,100,60,.25)"/>
        <ellipse cx="48" cy="17" rx="2.5" ry="1.2" fill="rgba(196,149,106,.13)" transform="rotate(-25 48 17)">
          <animate attributeName="transform" values="rotate(-25 48 17);rotate(15 48 17);rotate(-25 48 17)" dur="0.8s" repeatCount="indefinite"/>
        </ellipse>
      </g>
    </svg>
  )
}
