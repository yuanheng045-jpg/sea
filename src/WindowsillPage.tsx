import { useEffect, useMemo, useState } from 'react'
import { getPin } from './chatClient'

type WindowsillItem = {
  id: string
  capturedAt: string
  savedAt: string
  tags: string[]
  note: string
  url: string
}

function apiUrl(url: string) {
  return '/cc-api' + (url.startsWith('/') ? url : '/' + url)
}

function authHeaders() {
  return { 'X-Channel-Pin': getPin() }
}

function photoDate(iso: string) {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  }).format(new Date(iso))
}

function PrivatePhoto({ item, className }: { item: WindowsillItem; className: string }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    let objectUrl = ''
    setSrc('')
    setFailed(false)
    fetch(apiUrl(item.url), { credentials: 'include', headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('photo HTTP ' + r.status)
        return r.blob()
      })
      .then((blob) => {
        if (!alive) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch((e) => {
        console.error('windowsill photo load failed', e)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item.id, item.url])

  if (failed) return <div className={`${className} ws-photo-fallback`}>照片暂时没有照进来</div>
  if (!src) return <div className={`${className} ws-photo-loading`} aria-label="照片加载中" />
  return <img className={className} src={src} alt="" loading="lazy" decoding="async" />
}

async function savePhoto(item: WindowsillItem) {
  try {
    const r = await fetch(apiUrl(item.url), { credentials: 'include', headers: authHeaders() })
    if (!r.ok) throw new Error('download HTTP ' + r.status)
    const blob = await r.blob()
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `窗台-${dayKey(item.capturedAt)}-${item.id}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch (e) {
    console.error('windowsill photo download failed', e)
    alert('保存失败，稍后再试')
  }
}

export function WindowsillPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<WindowsillItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<WindowsillItem | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/cc-api/api/windowsill', {
        credentials: 'include',
        headers: authHeaders(),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      setItems(Array.isArray(d.items) ? d.items : [])
    } catch (e) {
      console.error('windowsill list failed', e)
      setError(getPin() ? '窗台暂时打不开' : '先打开主聊天完成验证')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    let previous = ''
    return items.map((item) => {
      const key = dayKey(item.capturedAt)
      const showDay = key !== previous
      previous = key
      return { item, showDay }
    })
  }, [items])

  return (
    <div className="ws-page">
      <header className="ws-header">
        <button className="ws-back" onClick={onBack} aria-label="返回">‹</button>
        <div>
          <h1>窗台</h1>
          <p>苏煦留下的，看见你的时刻</p>
        </div>
        <button className="ws-refresh" onClick={load} disabled={loading} aria-label="刷新">↻</button>
      </header>

      <main className="ws-timeline">
        {loading && <div className="ws-state">阳光正在落下来…</div>}
        {!loading && error && <div className="ws-state ws-error">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="ws-empty">
            <span className="ws-empty-light" />
            <p>窗台还是空的</p>
            <small>等苏煦想留下一张照片时，这里会亮起来。</small>
          </div>
        )}
        {!loading && !error && rows.map(({ item, showDay }) => (
          <section className="ws-row" key={item.id}>
            {showDay && <div className="ws-day">{dayLabel(item.capturedAt)}</div>}
            <span className="ws-dot" aria-hidden />
            <button className="ws-card" onClick={() => setSelected(item)}>
              <PrivatePhoto item={item} className="ws-thumb" />
              <div className="ws-copy">
                <time>{photoDate(item.capturedAt)}</time>
                {item.note && <p>{item.note}</p>}
                {item.tags?.length > 0 && (
                  <div className="ws-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                )}
              </div>
            </button>
          </section>
        ))}
      </main>

      {selected && (
        <div className="ws-overlay" onClick={() => setSelected(null)}>
          <article className="ws-detail" onClick={(e) => e.stopPropagation()}>
            <button className="ws-close" onClick={() => setSelected(null)} aria-label="关闭">×</button>
            <PrivatePhoto item={selected} className="ws-full" />
            <div className="ws-detail-copy">
              <time>{photoDate(selected.capturedAt)}</time>
              {selected.note && <p>{selected.note}</p>}
              {selected.tags?.length > 0 && (
                <div className="ws-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              )}
              <button className="ws-save" onClick={() => savePhoto(selected)}>保存这张照片</button>
            </div>
          </article>
        </div>
      )}
    </div>
  )
}
