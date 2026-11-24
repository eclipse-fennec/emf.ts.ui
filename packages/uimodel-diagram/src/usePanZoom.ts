import { reactive } from 'vue'

export function usePanZoom() {
  const view = reactive({ x: 0, y: 0, scale: 1 })
  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let viewStartX = 0
  let viewStartY = 0

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.2, Math.min(4, view.scale * factor))
    // Zoom toward cursor
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    view.x = cx - (cx - view.x) * (newScale / view.scale)
    view.y = cy - (cy - view.y) * (newScale / view.scale)
    view.scale = newScale
  }

  function onPanStart(e: PointerEvent) {
    // Middle mouse or space+left – for now just middle
    if (e.button === 1) {
      isPanning = true
      panStartX = e.clientX
      panStartY = e.clientY
      viewStartX = view.x
      viewStartY = view.y
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.preventDefault()
    }
  }

  function onPanMove(e: PointerEvent) {
    if (!isPanning) return
    view.x = viewStartX + (e.clientX - panStartX)
    view.y = viewStartY + (e.clientY - panStartY)
  }

  function onPanEnd() {
    isPanning = false
  }

  /**
   * Passt den Inhalt in den Zeichenbereich ein — zentriert und so weit
   * verkleinert, dass er ganz hineinpasst (nie über 1:1 vergrößert).
   * Ohne das stünde der Betrachter beim ersten Blick in der linken oberen Ecke
   * eines Plans, der weit darüber hinausreicht.
   */
  function fitTo(
    content: { x: number; y: number; w: number; h: number },
    viewport: { w: number; h: number },
    padding = 24,
  ): void {
    if (content.w <= 0 || content.h <= 0 || viewport.w <= 0 || viewport.h <= 0) return
    const scale = Math.max(
      0.2,
      Math.min(1, (viewport.w - 2 * padding) / content.w, (viewport.h - 2 * padding) / content.h),
    )
    view.scale = scale
    view.x = (viewport.w - content.w * scale) / 2 - content.x * scale
    view.y = (viewport.h - content.h * scale) / 2 - content.y * scale
  }

  return { view, onWheel, onPanStart, onPanMove, onPanEnd, fitTo }
}
