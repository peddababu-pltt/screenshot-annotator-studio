import type { Ann, BoxAnn, CalloutAnn, ImageAnn, LineAnn, NumberAnn, PenAnn, Pt, TextAnn } from "./types"

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

const imageCache = new Map<string, HTMLImageElement>()

function getCachedImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  const cached = imageCache.get(src)
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null
  const img = new Image()
  img.onload = () => onLoad && onLoad()
  img.src = src
  imageCache.set(src, img)
  return null
}

export function preloadAnnImages(anns: Ann[]): Promise<void> {
  const urls = anns.filter((a) => a.type === "image").map((a) => (a as ImageAnn).dataUrl)
  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          if (getCachedImage(src, resolve)) resolve()
        })
    )
  ).then(() => undefined)
}

export function rotPt(px: number, py: number, cx: number, cy: number, rad: number): [number, number] {
  const s = Math.sin(rad), c = Math.cos(rad)
  const dx = px - cx, dy = py - cy
  return [cx + dx * c - dy * s, cy + dx * s + dy * c]
}

export function rotBox(b: Bounds, rad: number): Bounds {
  if (!rad) return b
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const p = [b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x, b.y + b.h]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < 8; i += 2) {
    const [x, y] = rotPt(p[i], p[i + 1], cx, cy, rad)
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function annBounds(a: Ann): Bounds {
  switch (a.type) {
    case "rect":
    case "rrect":
    case "ellipse":
    case "highlight":
    case "blur":
    case "pixelate":
    case "callout":
    case "image":
      return { x: a.x, y: a.y, w: a.w, h: a.h }
    case "line":
    case "arrow":
      return {
        x: Math.min(a.x1, a.x2),
        y: Math.min(a.y1, a.y2),
        w: Math.abs(a.x2 - a.x1),
        h: Math.abs(a.y2 - a.y1),
      }
    case "text":
      return { x: a.x, y: a.y, w: a.w || 80, h: a.h || 0 }
    case "number":
      return { x: a.x - a.r, y: a.y - a.r, w: a.r * 2, h: a.r * 2 }
    case "pen":
      return penBounds(a)
  }
}

export function penBounds(a: PenAnn): Bounds {
  if (!a.points.length) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of a.points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)))
}

function penNear(pt: Pt, a: PenAnn, tol: number): boolean {
  for (let i = 0; i < a.points.length - 1; i++) {
    if (distanceToSegment(pt, a.points[i], a.points[i + 1]) <= tol) return true
  }
  return a.points.length > 0 && Math.hypot(pt.x - a.points[0].x, pt.y - a.points[0].y) <= tol
}

function ptInEllipse(pt: Pt, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (pt.x - cx) / (rx || 1), dy = (pt.y - cy) / (ry || 1)
  return dx * dx + dy * dy <= 1
}

export function hitOne(pt: Pt, a: Ann, tol = 6): boolean {
  switch (a.type) {
    case "rect":
    case "rrect":
    case "highlight":
    case "callout":
    case "image":
      return pt.x >= a.x - tol && pt.x <= a.x + a.w + tol && pt.y >= a.y - tol && pt.y <= a.y + a.h + tol
    case "ellipse":
      return ptInEllipse(pt, a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w) / 2 + tol, Math.abs(a.h) / 2 + tol)
    case "blur":
    case "pixelate":
      return pt.x >= a.x && pt.x <= a.x + a.w && pt.y >= a.y && pt.y <= a.y + a.h
    case "line":
    case "arrow":
      return distanceToSegment(pt, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= tol + a.strokeWidth
    case "text": {
      const b = computeTextBounds(a as TextAnn)
      return pt.x >= b.x - tol && pt.x <= b.x + b.w + tol && pt.y >= b.y - tol && pt.y <= b.y + b.h + tol
    }
    case "number":
      return Math.hypot(pt.x - a.x, pt.y - a.y) <= a.r + tol
    case "pen":
      return penNear(pt, a, tol)
  }
}

export function hitTest(pt: Pt, anns: Ann[], tol = 6): Ann | null {
  for (let i = anns.length - 1; i >= 0; i--) {
    const a = anns[i]
    if (!a.visible) continue
    if (hitOne(pt, a, tol)) return a
  }
  return null
}

// ---------------------------------------------------------------- drawing

export function textDimensions(a: TextAnn, measure: (w: number, h: number) => void) {
  const cv = document.createElement("canvas")
  const c2 = cv.getContext("2d")!
  cv.width = 2; cv.height = 2
  c2.font = `${a.fontWeight} ${a.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const lines = a.text.split("\n")
  let maxW = 0
  for (const l of lines) maxW = Math.max(maxW, c2.measureText(l).width)
  const w = maxW + a.padding * 2
  const h = lines.length * a.fontSize * 1.3 + a.padding * 2
  measure(w, h)
}

export function drawAnn(ctx: CanvasRenderingContext2D, a: Ann, onImageLoad?: () => void) {
  if (a.visible === false) return
  ctx.save()
  ctx.globalAlpha = a.opacity ?? 1
  switch (a.type) {
    case "rect": case "rrect": case "ellipse": case "highlight": {
      const b = a as BoxAnn
      const rot = b.rotation || 0
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2
      if (rot) { ctx.translate(cx, cy); ctx.rotate((rot * Math.PI) / 180); ctx.translate(-cx, -cy) }
      if (b.flipX || b.flipY) { ctx.translate(cx, cy); ctx.scale(b.flipX ? -1 : 1, b.flipY ? -1 : 1); ctx.translate(-cx, -cy) }
      if (b.type === "highlight") drawHighlight(ctx, b)
      else if (b.type === "ellipse") {
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.abs(b.w) / 2, Math.abs(b.h) / 2, 0, 0, Math.PI * 2)
        if (b.fill && b.fill !== "transparent") { ctx.fillStyle = b.fill; ctx.fill() }
        if (b.stroke && b.stroke !== "transparent" && b.strokeWidth > 0) {
          applyDash(ctx, b.dash, b.strokeWidth)
          ctx.strokeStyle = b.stroke; ctx.lineWidth = b.strokeWidth; ctx.stroke()
          ctx.setLineDash([])
        }
      } else {
        strokeRectCtx(ctx, b.x, b.y, b.w, b.h, b.type === "rrect" ? b.radius : 0, b)
      }
      break
    }
    case "image": {
      const im = a as ImageAnn
      const rot = im.rotation || 0
      const cx = im.x + im.w / 2, cy = im.y + im.h / 2
      if (rot) { ctx.translate(cx, cy); ctx.rotate((rot * Math.PI) / 180); ctx.translate(-cx, -cy) }
      if (im.flipX || im.flipY) { ctx.translate(cx, cy); ctx.scale(im.flipX ? -1 : 1, im.flipY ? -1 : 1); ctx.translate(-cx, -cy) }
      const img = getCachedImage(im.dataUrl, onImageLoad)
      if (img) ctx.drawImage(img, im.x, im.y, im.w, im.h)
      break
    }
    case "blur":
    case "pixelate":
      drawEffect(ctx, a as BoxAnn & { type: "blur" | "pixelate" })
      break
    case "line":
    case "arrow": {
      const l = a as LineAnn
      ctx.strokeStyle = l.stroke
      ctx.lineWidth = l.strokeWidth
      ctx.lineCap = "round"
      applyDash(ctx, l.dash, l.strokeWidth)
      ctx.beginPath()
      ctx.moveTo(l.x1, l.y1)
      ctx.lineTo(l.x2, l.y2)
      ctx.stroke()
      ctx.setLineDash([])
      if (l.headType !== "none") arrowHead(ctx, l.x1, l.y1, l.x2, l.y2, l.stroke, l.strokeWidth, l.headType)
      break
    }
    case "text":
      drawText(ctx, a as TextAnn)
      break
    case "callout":
      drawCallout(ctx, a as CalloutAnn)
      break
    case "number":
      drawNumber(ctx, a as NumberAnn)
      break
    case "pen":
      drawPen(ctx, a as PenAnn)
      break
  }
  ctx.restore()
}

function applyDash(ctx: CanvasRenderingContext2D, dash: "solid" | "dashed" | "dotted" | undefined, sw: number) {
  if (dash === "dashed") ctx.setLineDash([sw * 2.5, sw * 1.8])
  else if (dash === "dotted") ctx.setLineDash([sw * 0.9, sw * 1.4])
  else ctx.setLineDash([])
}

interface BoxRect extends BoxAnn {}
function strokeRectCtx(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, b?: Partial<BoxAnn>) {
  const fill = (b as BoxAnn)?.fill
  const stroke = (b as BoxAnn)?.stroke
  const sw = (b as BoxAnn)?.strokeWidth
  roundRectPath(ctx, x, y, w, h, r)
  if (fill && fill !== "transparent") { ctx.fillStyle = fill; ctx.fill() }
  if (stroke && stroke !== "transparent" && sw && sw > 0) {
    applyDash(ctx, (b as BoxAnn)?.dash, sw)
    ctx.strokeStyle = stroke
    ctx.lineWidth = sw
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function drawHighlight(ctx: CanvasRenderingContext2D, b: BoxAnn) {
  const w = b.w, h = b.h
  ctx.globalAlpha = b.opacity ?? 0.3
  ctx.fillStyle = b.fill || "#FACC15"
  if (b.overflow) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.rect(b.x - 1, b.y - 1, w + 2, h + 2)
    ctx.clip("evenodd")
    roundRectPath(ctx, b.x - 12, b.y - 12, w + 24, h + 24, Math.max(4, b.radius))
    ctx.fill()
    ctx.restore()
  } else {
    roundRectPath(ctx, b.x, b.y, w, h, b.radius)
    ctx.fill()
  }
  if (b.stroke && b.stroke !== "transparent" && b.strokeWidth > 0) {
    ctx.globalAlpha = b.opacity ?? 1
    ctx.strokeStyle = b.stroke
    ctx.lineWidth = b.strokeWidth
    ctx.stroke()
  }
}

export function drawEffect(ctx: CanvasRenderingContext2D, a: BoxAnn) {
  const x = a.x, y = a.y, w = a.w, h = a.h
  ctx.save()
  ctx.globalAlpha = 1
  ctx.beginPath()
  if (a.radius) roundRectPath(ctx, x, y, w, h, a.radius)
  else ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(ctx.canvas, 0, 0)
  if (a.type === "blur") {
    const strength = Math.max(0.5, (a.strength ?? 12) * 0.5)
    ctx.filter = `blur(${strength}px)`
    ctx.drawImage(ctx.canvas, x, y, w, h, x, y, w, h)
    ctx.filter = "none"
  } else {
    const size = Math.max(2, a.per ?? 14)
    const cols = Math.max(1, Math.round(w / size))
    const rows = Math.max(1, Math.round(h / size))
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(ctx.canvas, x, y, w, h, x, y, cols, rows)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(ctx.canvas, x, y, cols, rows, x, y, w, h)
  }
  ctx.restore()
  ctx.fillStyle = "rgba(0,0,0,0.001)"
  ctx.fillRect(x, y, w, h)
}

function drawText(ctx: CanvasRenderingContext2D, a: TextAnn) {
  const lines = a.text.split("\n")
  const font = `${a.fontWeight} ${a.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.font = font
  ctx.textBaseline = "top"
  const widths = lines.map((l) => ctx.measureText(l).width)
  const boxW = Math.max(...widths) + a.padding * 2
  const boxH = lines.length * a.fontSize * 1.3 + a.padding * 2
  const pad = a.padding
  const rot = a.rotation || 0
  ctx.save()
  ctx.translate(a.x + boxW / 2, a.y + boxH / 2)
  ctx.rotate((rot * Math.PI) / 180)
  const bx = -boxW / 2, by = -boxH / 2
  if (a.bg && a.bg !== "transparent") {
    roundRectPath(ctx, bx, by, boxW, boxH, a.radius)
    ctx.globalAlpha = (a.opacity ?? 1) * (a.bgOpacity > 0 ? a.bgOpacity : 1)
    ctx.fillStyle = a.bg
    ctx.fill()
    ctx.globalAlpha = a.opacity ?? 1
  }
  ctx.fillStyle = a.color
  ctx.textAlign = a.align === "center" ? "center" : a.align === "left" ? "left" : "right"
  const lx = a.align === "left" ? bx + pad : a.align === "right" ? bx + boxW - pad : 0
  lines.forEach((line, i) => {
    ctx.fillText(line, lx, by + pad + i * (a.fontSize * 1.3))
  })
  ctx.restore()
  ctx.textAlign = "left"
}

function drawCallout(ctx: CanvasRenderingContext2D, a: CalloutAnn) {
  const pad = a.padding
  const r = Math.min(a.radius, a.w / 2, a.h / 2)
  const cx = a.x + a.w / 2
  const boxBottom = a.y + a.h
  const tailOut = a.tailY > boxBottom + 1 || a.tailX < a.x || a.tailX > a.x + a.w

  roundRectPath(ctx, a.x, a.y, a.w, a.h, r)
  ctx.fillStyle = a.bg
  ctx.fill()
  if (a.stroke && a.stroke !== "transparent" && a.strokeWidth > 0) {
    ctx.strokeStyle = a.stroke
    ctx.lineWidth = a.strokeWidth
    ctx.stroke()
  }

  if (tailOut) {
    const startX = Math.max(a.x + r, Math.min(a.x + a.w - r, a.tailX))
    ctx.strokeStyle = a.stroke || a.bg
    ctx.lineWidth = Math.max(2, a.strokeWidth * 1.6)
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(startX, boxBottom)
    ctx.lineTo(a.tailX, a.tailY)
    ctx.stroke()
    const dx = a.tailX - startX, dy = a.tailY - boxBottom
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    const hs = Math.max(6, a.strokeWidth * 3.2)
    ctx.fillStyle = a.stroke || a.bg
    ctx.beginPath()
    ctx.moveTo(a.tailX, a.tailY)
    ctx.lineTo(a.tailX - ux * hs - uy * hs * 0.5, a.tailY - uy * hs + ux * hs * 0.5)
    ctx.lineTo(a.tailX - ux * hs + uy * hs * 0.5, a.tailY - uy * hs - ux * hs * 0.5)
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = a.color
  ctx.font = `${a.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textBaseline = "top"
  ctx.textAlign = "left"
  const lines = a.text.split("\n")
  lines.forEach((line, i) => {
    ctx.fillText(line, a.x + pad, a.y + pad + i * (a.fontSize * 1.3))
  })
  ctx.textAlign = "left"
}

function drawNumber(ctx: CanvasRenderingContext2D, a: NumberAnn) {
  const r = a.r
  ctx.beginPath()
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2)
  ctx.fillStyle = a.fill
  ctx.fill()
  if (a.stroke && a.stroke !== "transparent" && a.strokeWidth > 0) {
    ctx.strokeStyle = a.stroke
    ctx.lineWidth = a.strokeWidth
    ctx.stroke()
  }
  ctx.fillStyle = a.color
  ctx.font = `600 ${r * 1.1}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(String(a.n), a.x, a.y + 1)
  ctx.textAlign = "start"
  ctx.textBaseline = "alphabetic"
}

function drawPen(ctx: CanvasRenderingContext2D, a: PenAnn) {
  if (a.points.length < 2) return
  ctx.strokeStyle = a.stroke
  ctx.lineWidth = a.strokeWidth
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(a.points[0].x, a.points[0].y)
  for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y)
  ctx.stroke()
}

export function arrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, sw: number, style: string) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  const head = Math.max(10, sw * 4)
  if (style === "lines") {
    ctx.strokeStyle = color
    ctx.lineWidth = sw * 0.75
    ctx.beginPath()
    ctx.moveTo(x2 - ux * head - uy * head * 0.55, y2 - uy * head + ux * head * 0.55)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x2 - ux * head + uy * head * 0.55, y2 - uy * head - ux * head * 0.55)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - ux * head - uy * head * 0.5, y2 - uy * head + ux * head * 0.5)
    ctx.lineTo(x2 - ux * head + uy * head * 0.5, y2 - uy * head - ux * head * 0.5)
    ctx.closePath()
    ctx.fill()
  }
}

export function drawSelection(ctx: CanvasRenderingContext2D, a: Ann, scale: number) {
  const b = annBounds(a)
  const pad = 3.5
  ctx.save()
  ctx.strokeStyle = "#2563EB"
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  const bx = b.x - pad, by = b.y - pad, bw = b.w + pad * 2, bh = b.h + pad * 2
  ctx.rect(bx, by, bw, bh)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

export type HandleKey = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot"

export function handlePos(a: Ann, k: HandleKey): Pt {
  const { x, y, w, h } = annBoundsForEdit(a)
  let px = x, py = y
  if (k === "nw") { px = x; py = y }
  else if (k === "n") { px = x + w / 2; py = y }
  else if (k === "ne") { px = x + w; py = y }
  else if (k === "e") { px = x + w; py = y + h / 2 }
  else if (k === "se") { px = x + w; py = y + h }
  else if (k === "s") { px = x + w / 2; py = y + h }
  else if (k === "sw") { px = x; py = y + h }
  else { px = x; py = y + h / 2 }
  const rot = (a.rotation || 0) * Math.PI / 180
  const [rx, ry] = rotPt(px, py, x + w / 2, y + h / 2, rot)
  return { x: rx, y: ry }
}

export function computeTextBounds(a: TextAnn): Bounds {
  const cv = document.createElement("canvas")
  const c2 = cv.getContext("2d")!
  cv.width = 4; cv.height = 4
  c2.font = `${a.fontWeight} ${a.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const lines = a.text.split("\n")
  let maxW = 0
  for (const l of lines) maxW = Math.max(maxW, c2.measureText(l).width)
  const w = maxW + a.padding * 2
  const h = lines.length * a.fontSize * 1.3 + a.padding * 2
  return { x: a.x, y: a.y, w, h }
}

function annBoundsForEdit(a: Ann): Bounds {
  if (a.type === "text") return computeTextBounds(a)
  if (a.type === "line" || a.type === "arrow") {
    return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x1 - a.x2), h: Math.abs(a.y1 - a.y2) }
  }
  return annBounds(a)
}

export function editBounds(a: Ann): Bounds {
  return annBoundsForEdit(a)
}

export function lineEndpoints(a: LineAnn): [Pt, Pt] {
  return [{ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }]
}

export function isBoxLike(a: Ann): boolean {
  return ["rect", "rrect", "ellipse", "highlight", "callout", "blur", "pixelate"].includes(a.type)
}

export function isLineLike(a: Ann): boolean {
  return a.type === "line" || a.type === "arrow"
}

export function rotatePointAround(p: Pt, angDeg: number): Pt {
  const rad = (angDeg * Math.PI) / 180
  return { x: p.x * Math.cos(rad) - p.y * Math.sin(rad), y: p.x * Math.sin(rad) + p.y * Math.cos(rad) }
}