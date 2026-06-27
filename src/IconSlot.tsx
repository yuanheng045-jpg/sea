import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIcons, setIcon, type IconKey } from './icons'
import { CropDialog } from './CropDialog'

type Props = {
  iconKey: IconKey
  fallback: ReactNode
  className?: string
}

export function IconSlot({ iconKey, fallback, className }: Props) {
  const icons = useIcons()
  const src = icons[iconKey]
  const [menuOpen, setMenuOpen] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const longPressedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startRef = useRef<{ x: number; y: number } | null>(null)

  const ptXY = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    const m = e as React.MouseEvent
    return { x: m.clientX, y: m.clientY }
  }

  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
    longPressedRef.current = false
    startRef.current = ptXY(e)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true
      setMenuOpen(true)
    }, 600)
  }

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const sr = startRef.current
    if (!sr || timerRef.current === undefined) return
    const q = ptXY(e)
    if (Math.hypot(q.x - sr.x, q.y - sr.y) > 10) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
      startRef.current = null
    }
  }

  const onUp = () => {
    startRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (longPressedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      longPressedRef.current = false
    }
  }

  const openFile = () => {
    fileInputRef.current?.click()
    setMenuOpen(false)
  }

  const reset = () => {
    setIcon(iconKey, null)
    setMenuOpen(false)
  }

  return (
    <>
      <div
        className={`img-slot ${className ?? ''}${src ? ' has-img' : ''}`}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
        onTouchCancel={onUp}
        onClickCapture={onClickCapture}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true) }}
      >
        {src ? <img src={src} alt="" /> : fallback}
      </div>
      {menuOpen && createPortal(
        <div
          className="icon-menu-backdrop"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
        >
          <div className="icon-menu" onClick={(e) => e.stopPropagation()}>
            <button
              className="icon-menu-btn"
              onClick={(e) => { e.stopPropagation(); openFile() }}
            >上传图片</button>
            {src && (
              <button
                className="icon-menu-btn"
                onClick={(e) => { e.stopPropagation(); reset() }}
              >重置</button>
            )}
            <button
              className="icon-menu-btn icon-menu-cancel"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
            >取消</button>
          </div>
        </div>,
        document.body,
      )}
      {cropSrc && createPortal(
        <CropDialog
          imageSrc={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataURL) => {
            setIcon(iconKey, dataURL)
            setCropSrc(null)
          }}
        />,
        document.body,
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            const reader = new FileReader()
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                setCropSrc(reader.result)
              }
            }
            reader.readAsDataURL(file)
          }
          e.target.value = ''
        }}
      />
    </>
  )
}
