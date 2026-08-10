import type { Ann, BoxAnn, CalloutAnn, LineAnn, NumberAnn, Page, PenAnn, TextAnn } from "./types"
import { defaultAnn } from "./types"
import type { HandleKey } from "./draw"
import { annBounds, computeTextBounds, isLineLike, handlePos } from "./draw"

export type Tool = "select" | "rect" | "rrect" | "ellipse" | "line" | "arrow" | "text" | "number" | "pen" | "highlight" | "blur" | "pixelate" | "callout" | "eraser" | "crop" | "insertImage" | "background" | "textEdit"

export interface P {
  x: number
  y: number
}
export interface B {
  x: number
  y: number
  w: number
  h: number
}

export function isBoxAnn(a: Ann): boolean {
  return ["rect", "rrect", "ellipse", "highlight", "blur", "pixelate", "callout", "image"].includes(a.type)
}
export function canRotAnn(a: Ann): boolean {
  return a.type === "text" || a.type === "number" || isBoxAnn(a)
}

export function movePatch(a: Ann, dx: number, dy: number): Partial<Ann> {
  if (isLineLike(a)) {
    const l = a as LineAnn
    return { x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy }
  }
  if (a.type === "callout") {
    const c = a as CalloutAnn
    return { x: c.x + dx, y: c.y + dy, tailX: c.tailX + dx, tailY: c.tailY + dy }
  }
  if (a.type === "number") {
    const n = a as NumberAnn
    return { x: n.x + dx, y: n.y + dy }
  }
  const b = a as BoxAnn
  return { x: b.x + dx, y: b.y + dy }
}

export function resizeBox(base: B, hk: HandleKey, start: P, cur: P): B {
  let nx = base.x, ny = base.y, nw = base.w, nh = base.h
  const dx = cur.x - start.x
  const dy = cur.y - start.y
  if (hk.includes("w")) { nx = base.x + dx; nw = base.w - dx }
  if (hk.includes("e")) nw = base.w + dx
  if (hk.includes("n")) { ny = base.y + dy; nh = base.h - dy }
  if (hk.includes("s")) nh = base.h + dy
  return { x: nx, y: ny, w: Math.max(4, nw), h: Math.max(4, nh) }
}

export function resizeNumber(a: NumberAnn, r0: number, start: P, cur: P): Partial<Ann> {
  const cx = a.x, cy = a.y
  const d0 = Math.hypot(start.x - cx, start.y - cy)
  const d1 = Math.hypot(cur.x - cx, cur.y - cy)
  const r = d0 > 1 ? Math.max(10, r0 * (d1 / d0)) : r0
  return { r }
}

export function resizeText(a: TextAnn, start: P, cur: P): Partial<Ann> {
  const base = computeTextBounds(a)
  const scale = base.h > 4 ? (1 + (cur.y - start.y) / base.h) : 1
  return { fontSize: Math.max(8, Math.round(a.fontSize * scale)) }
}

export function rotateValue(center: P, rot0: number, start: P, cur: P): number {
  const a0 = (Math.atan2(start.y - center.y, start.x - center.x) * 180) / Math.PI
  const a1 = (Math.atan2(cur.y - center.y, cur.x - center.x) * 180) / Math.PI
  let rot = (rot0 + (a1 - a0)) % 360
  if (rot < 0) rot += 360
  return rot
}

export function draftFor(tl: Tool, color: string, sw: number, a: P, b: P): Ann | null {
  switch (tl) {
    case "rect":
    case "rrect":
    case "ellipse":
    case "highlight":
    case "blur":
    case "pixelate":
    case "callout": {
      const d = defaultAnn(tl) as BoxAnn
      d.x = Math.min(a.x, b.x)
      d.y = Math.min(a.y, b.y)
      d.w = Math.abs(a.x - b.x)
      d.h = Math.abs(a.y - b.y)
      if (tl === "highlight") { d.stroke = "transparent"; d.strokeWidth = 0 }
      if (tl === "callout") { const c = d as CalloutAnn; c.tailX = c.x + c.w / 2; c.tailY = c.y + c.h }
      return d
    }
    case "line":
    case "arrow": {
      const d = defaultAnn(tl) as LineAnn
      d.x1 = a.x; d.y1 = a.y; d.x2 = b.x; d.y2 = b.y
      d.stroke = color
      d.strokeWidth = sw
      return d
    }
    case "pen": {
      const d = defaultAnn("pen") as PenAnn
      d.points = [{ ...a }]
      d.stroke = color
      d.strokeWidth = sw
      return d
    }
    default:
      return null
  }
}

export function draftValid(a: Ann): boolean {
  if (isBoxAnn(a)) { const b = a as BoxAnn; return b.w > 4 && b.h > 4 }
  if (isLineLike(a)) { const l = a as LineAnn; return Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > 8 }
  if (a.type === "pen") return (a as PenAnn).points.length >= 2
  return true
}

export function handleHitA(a: Ann, pt: P, scale: number): HandleKey | null {
  const hs = (9 / scale) + 1
  if (isBoxAnn(a)) {
    const hks = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as HandleKey[]
    for (const k of hks) {
      const hp = handlePos(a, k)
      if (Math.abs(hp.x - pt.x) <= hs && Math.abs(hp.y - pt.y) <= hs) return k
    }
    return null
  }
  if (a.type === "text") {
    const b = computeTextBounds(a as TextAnn)
    const corners: [number, number][] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]
    const keys = ["nw", "ne", "se", "sw"] as HandleKey[]
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(corners[i][0] - pt.x, corners[i][1] - pt.y) <= hs) return keys[i]
    }
    return null
  }
  return null
}

export function endpointHitA(a: Ann, pt: P, s: number): "start" | "end" | null {
  if (!isLineLike(a)) return null
  const l = a as LineAnn
  const hs = 12 / s
  if (Math.hypot(l.x1 - pt.x, l.y1 - pt.y) <= hs) return "start"
  if (Math.hypot(l.x2 - pt.x, l.y2 - pt.y) <= hs) return "end"
  return null
}

export function tailHitA(a: Ann, pt: P, s: number): boolean {
  if (a.type !== "callout") return false
  return Math.hypot((a as CalloutAnn).tailX - pt.x, (a as CalloutAnn).tailY - pt.y) <= 12 / s
}

export function rotHitA(a: Ann, box: B, pt: P, s: number): boolean {
  const cx = box.x + box.w / 2
  return Math.hypot(cx - pt.x, box.y - 30 / s - pt.y) <= 12 / s
}

export function centerOf(box: B): P {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

export function applyCrop(page: Page, rect: B): Page {
  const rx = Math.max(0, Math.round(rect.x))
  const ry = Math.max(0, Math.round(rect.y))
  const rw = Math.max(1, Math.round(rect.w))
  const rh = Math.max(1, Math.round(rect.h))
  const anns = page.annotations
    .map((a) => ({ ...a, ...movePatch(a, -rx, -ry) } as Ann))
    .filter((a) => {
      const b = annBounds(a)
      return b.x + b.w > 0 && b.y + b.h > 0 && b.x < rw && b.y < rh
    })
  return { ...page, w: rw, h: rh, annotations: anns }
}

export function fallbackBox(a: Ann): B {
  if (isLineLike(a)) {
    const l = a as LineAnn
    return {
      x: Math.min(l.x1, l.x2),
      y: Math.min(l.y1, l.y2),
      w: Math.abs(l.x2 - l.x1),
      h: Math.abs(l.y2 - l.y1),
    }
  }
  if (a.type === "number") {
    const n = a as NumberAnn
    return { x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}