import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'

type Props = {
  imageSrc: string
  onCancel: () => void
  onConfirm: (dataURL: string) => void
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

async function getCroppedDataURL(imageSrc: string, area: Area, isPng: boolean): Promise<string> {
  const img = await loadImage(imageSrc)
  const SIZE = 256
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, SIZE, SIZE,
  )
  return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88)
}

export function CropDialog({ imageSrc, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  const onCropComplete = useCallback((_: Area, p: Area) => {
    setPixels(p)
  }, [])

  const handleConfirm = async () => {
    if (!pixels || busy) return
    setBusy(true)
    try {
      const isPng = imageSrc.startsWith('data:image/png')
      const data = await getCroppedDataURL(imageSrc, pixels, isPng)
      onConfirm(data)
    } catch (e) {
      console.warn('crop failed', e)
      onCancel()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="crop-backdrop" onClick={onCancel}>
      <div className="crop-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="crop-area">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="crop-zoom-row">
          <span className="crop-zoom-label">缩放</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </div>
        <div className="crop-actions">
          <button className="icon-menu-btn icon-menu-cancel" onClick={onCancel}>取消</button>
          <button className="icon-menu-btn" onClick={handleConfirm} disabled={busy || !pixels}>
            {busy ? '处理中…' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
