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

  const onDown = () => {
    longPressedRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true
      setMenuOpen(true)
    }, 600)
  }

  const onUp = () => {
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
        onMouseUp={onUp}
        onTouchStart={onDown}
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
