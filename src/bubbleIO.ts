// 气泡 backdrop-filter 的 IO gate
// 滚出可视区的气泡自动卸 blur,GPU 开销与气泡总数无关
let io: IntersectionObserver | null = null

if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) e.target.setAttribute('data-bf', 'on')
      else e.target.removeAttribute('data-bf')
    }
  }, { rootMargin: '150px 0px', threshold: 0 })
}

// callback ref:挂到 .cc-paragraph 上,卸载时 React 传 null
export function observeBubble(el: HTMLElement | null) {
  if (!io || !el) return
  io.observe(el)
}
