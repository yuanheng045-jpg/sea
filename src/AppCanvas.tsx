import { useRef, useState } from 'react'
import type { Page } from './App'
import { IconSlot } from './IconSlot'
import type { IconKey } from './icons'
import { useAppPos, setAppPos, type Pos } from './appPos'

export type AppDef = { key: Page; iconKey: IconKey; icon: string; label: string; def: Pos }

export function AppCanvas({ apps, onNavigate, panel }: {
  apps: AppDef[]
  onNavigate: (p: Page) => void
  panel?: boolean
}) {
  const stored = useAppPos()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ key: string; x: number; y: number } | null>(null)
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const draggedRef = useRef(false)

  const posOf = (a: AppDef): Pos =>
    (drag && drag.key === a.key) ? { x: drag.x, y: drag.y } : (stored[a.key] ?? a.def)

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY, moved: false }
    draggedRef.current = false
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
  }

  const onPointerMove = (e: React.PointerEvent, a: AppDef) => {
    const st = startRef.current
    if (!st) return
    const dx = e.clientX - st.x, dy = e.clientY - st.y
    if (!st.moved && Math.hypot(dx, dy) < 8) return
    st.moved = true
    draggedRef.current = true
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    let x = ((e.clientX - rect.left) / rect.width) * 100
    let y = ((e.clientY - rect.top) / rect.height) * 100
    x = Math.max(8, Math.min(92, x))
    y = Math.max(4, Math.min(95, y))
    setDrag({ key: a.key, x, y })
    e.preventDefault()
  }

  const onPointerUp = (e: React.PointerEvent, a: AppDef) => {
    const st = startRef.current
    startRef.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    if (st?.moved && drag && drag.key === a.key) setAppPos(a.key, { x: drag.x, y: drag.y })
    setDrag(null)
  }

  const onClick = (a: AppDef) => {
    if (draggedRef.current) { draggedRef.current = false; return }
    onNavigate(a.key)
  }

  return (
    <div className={`app-canvas${panel ? ' app-canvas--panel' : ''}`} ref={canvasRef}>
      {apps.map(a => {
        const p = posOf(a)
        return (
          <div
            key={a.key}
            className={`app-free${drag?.key === a.key ? ' dragging' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => onPointerMove(e, a)}
            onPointerUp={(e) => onPointerUp(e, a)}
            onClick={() => onClick(a)}
          >
            <IconSlot iconKey={a.iconKey} fallback={a.icon} className="img-tile" />
            <span className="tile-label">{a.label}</span>
          </div>
        )
      })}
    </div>
  )
}
