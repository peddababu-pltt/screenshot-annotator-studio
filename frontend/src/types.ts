export type AnnType =
  | "rect"
  | "rrect"
  | "callout"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "number"
  | "pen"
  | "highlight"
  | "blur"
  | "pixelate"
  | "image"

export interface Pt {
  x: number
  y: number
}

export interface AnnBase {
  id: string
  visible: boolean
  rotation: number
  opacity: number
  name?: string
  locked?: boolean
  flipX?: boolean
  flipY?: boolean
}

export interface BoxAnn extends AnnBase {
  type: "rect" | "rrect" | "ellipse" | "highlight" | "blur" | "pixelate" | "callout"
  x: number
  y: number
  w: number
  h: number
  stroke: string
  strokeWidth: number
  dash?: "solid" | "dashed" | "dotted"
  fill: string
  fillOpacity?: number
  radius: number
  overflow?: boolean
  // effect
  strength?: number
  per?: number
}

export interface LineAnn extends AnnBase {
  type: "line" | "arrow"
  x: number
  y: number
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  dash?: "solid" | "dashed" | "dotted"
  headType: "none" | "triangle" | "lines"
}

export interface TextAnn extends AnnBase {
  type: "text"
  x: number
  y: number
  text: string
  fontSize: number
  fontWeight: number
  align: "left" | "center" | "right"
  color: string
  bg: string
  bgOpacity: number
  padding: number
  radius: number
  width?: number
}

export interface CalloutAnn extends AnnBase {
  type: "callout"
  x: number
  y: number
  w: number
  h: number
  text: string
  fontSize: number
  color: string
  bg: string
  stroke: string
  strokeWidth: number
  padding: number
  radius: number
  tailX: number
  tailY: number
}

export interface NumberAnn extends AnnBase {
  type: "number"
  x: number
  y: number
  n: number
  r: number
  fill: string
  color: string
  stroke: string
  strokeWidth: number
}

export interface PenAnn extends AnnBase {
  type: "pen"
  points: Pt[]
  stroke: string
  strokeWidth: number
}

export interface ImageAnn extends AnnBase {
  type: "image"
  x: number
  y: number
  w: number
  h: number
  dataUrl: string
}

export type Ann = BoxAnn | LineAnn | TextAnn | CalloutAnn | NumberAnn | PenAnn | ImageAnn

export interface Page {
  id: string
  title: string
  imageName: string
  dataUrl: string
  w: number
  h: number
  annotations: Ann[]
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  activePage: number
  pages: Page[]
}

export const ACCENT = "#2563EB"
export const ANN_RED = "#EF4444"
export const ANN_YELLOW = "#FACC15"
export const DANGER = "#DC2626"
export const SUCCESS = "#16A34A"

export const CLR = {
  bg: "#F7F7F5",
  surface: "#FFFFFF",
  border: "#E5E5E5",
  text: "#111111",
  secondary: "#6B6B6B",
  accent: "#2563EB",
  danger: "#DC2626",
  success: "#16A34A",
}

export function uid(prefix = "ob"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function emptyPage(imageName: string, dataUrl: string, w: number, h: number): Page {
  return { id: uid("pg"), title: imageName, imageName, dataUrl, w, h, annotations: [] }
}

export function newProjectFromPage(page: Page): Project {
  return {
    id: uid("pr"),
    name: page.imageName.replace(/\.[^.]+$/, ""),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activePage: 0,
    pages: [page],
  }
}

export function defaultAnn(type: Exclude<AnnType, "line"> | "line", seed?: Partial<Ann>): Ann {
  const s = seed || {}
  const base = {
    id: (s as AnnBase).id || uid("ann"),
    visible: s.visible !== undefined ? s.visible : true,
    opacity: s.opacity !== undefined ? s.opacity : 1,
  }
  switch (type) {
    case "rect":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 100, h: s.h || 60, stroke: s.stroke || ANN_RED, strokeWidth: s.strokeWidth ?? 3, fill: "transparent", radius: 0 }
    case "rrect":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 100, h: s.h || 60, stroke: s.stroke || ANN_RED, strokeWidth: s.strokeWidth ?? 3, fill: "transparent", radius: s.radius ?? 10 }
    case "ellipse":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 100, h: s.h || 60, stroke: s.stroke || ANN_RED, strokeWidth: s.strokeWidth ?? 3, fill: "transparent", radius: 0 }
    case "highlight":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 160, h: s.h || 40, stroke: "transparent", strokeWidth: 0, fill: ANN_YELLOW, radius: 4, opacity: s.opacity ?? 0.3, overflow: false }
    case "blur":
    case "pixelate":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 160, h: s.h || 80, stroke: "transparent", strokeWidth: 0, fill: "transparent", radius: 0, strength: s.strength ?? 12, per: s.per ?? 14 }
    case "callout":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 200, h: s.h || 60, text: s.text || "Text", fontSize: s.fontSize ?? 14, color: s.color || "#111111", bg: s.bg || "#FFFFFF", stroke: s.stroke || "#999999", strokeWidth: s.strokeWidth ?? 1.5, padding: s.padding ?? 12, radius: 8, tailX: s.tailX || 0, tailY: s.tailY || 0 }
    case "text":
      return { ...base, type, x: s.x || 0, y: s.y || 0, text: s.text !== undefined ? s.text : "Add text", fontSize: s.fontSize ?? 18, fontWeight: s.fontWeight ?? 500, align: "left", color: s.color || CLR.text, bg: "transparent", bgOpacity: 0, padding: 6, radius: 4 }
    case "number":
      return { ...base, type, x: s.x || 0, y: s.y || 0, n: s.n ?? 1, r: s.r ?? 20, fill: s.fill || ANN_RED, color: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: 2 }
    case "line":
      return { ...base, type, x: s.x || 0, y: s.y || 0, x1: s.x1 ?? 0, y1: s.y1 ?? 0, x2: s.x2 ?? 120, y2: s.y2 ?? 60, stroke: s.stroke || CLR.text, strokeWidth: s.strokeWidth ?? 2, headType: "none" }
    case "arrow":
      return { ...base, type, x: s.x || 0, y: s.y || 0, x1: s.x1 ?? 0, y1: s.y1 ?? 0, x2: s.x2 ?? 120, y2: s.y2 ?? 60, stroke: s.stroke || ANN_RED, strokeWidth: s.strokeWidth ?? 3, headType: "triangle" }
    case "pen":
      return { ...base, type, points: s.points || [], stroke: s.stroke || CLR.text, strokeWidth: s.strokeWidth ?? 2 }
    case "image":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 200, h: s.h || 150, dataUrl: (s as ImageAnn).dataUrl || "" }
    default:
      return { ...base, type: "rect", x: 0, y: 0, w: 100, h: 60, stroke: ANN_RED, strokeWidth: 3, fill: "transparent", radius: 0 }
  }
}

export type Node =
  | "select"
  | "rect"
  | "rrect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "number"
  | "pen"
  | "highlight"
  | "blur"
  | "pixelate"
  | "callout"
  | "image"
  | "eraser"
  | "crop"
  | "insertImage"
  | "background"