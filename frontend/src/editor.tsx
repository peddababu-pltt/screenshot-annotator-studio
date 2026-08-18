import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Ann, BoxAnn, CalloutAnn, ImageAnn, LineAnn, NumberAnn, PenAnn, Project, TextAnn } from "./types"
import type { Page } from "./types"
import { ANN_RED, defaultAnn, uid } from "./types"
import { drawAnn, drawSelection, editBounds, hitOne, computeTextBounds, annBounds, preloadAnnImages } from "./draw"
import type { HandleKey } from "./draw"
import {
  centerOf, draftFor, draftValid, endpointHitA, handleHitA, isBoxAnn, movePatch, canRotAnn,
  resizeBox, resizeNumber, resizeText, rotateValue, rotHitA, tailHitA, applyCrop, type P, type Tool, type B,
} from "./engine"
import { TOOLS, TOOL_KEY, isLineTool, isBoxTool, SWATCHES } from "./tools"
import { I } from "./icons"
import { upsertProject, deleteProject } from "./persist"
import { readImageFile, cropDataUrl } from "./files"
import { scanText, sampleEdgeColor, type OcrRegion } from "./ocr"
import RightPanel from "./panels"
import PagesLayersColumn from "./sidebar"
import CanvasToolbar from "./toppanel"
import ExportModal, { Preview } from "./export"
import { useTheme } from "./theme"
import { useT } from "./translations"

interface Props {
  project: Project
  onProject: (p: Project) => void
  onExit: () => void
  onToast: (m: string, e?: boolean) => void
  headerExtra?: ReactNode
}

type Mode = null | "pan" | "marquee" | "move" | "resize" | "draw" | "rot" | "tail" | "endpoint"

const cloneProj = (p: Project): Project => JSON.parse(JSON.stringify(p))

export default function Editor({ project: initial, onProject, onExit, onToast, headerExtra }: Props) {
  const th = useTheme()
  const { t } = useT()
  const [proj, setProj] = useState<Project>(() => cloneProj(initial))
  const [tool, setTool] = useState<Tool>("select")
  const [color, setColor] = useState(ANN_RED)
  const [sw, setSw] = useState(3)
  const [sel, setSel] = useState<string[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [pop, setPop] = useState<"export" | null>(null)
  const [tabs, setTabs] = useState<"style" | "arrange">("style")
  const [cropRect, setCropRect] = useState<B | null>(null)
  const [ocrRegions, setOcrRegions] = useState<OcrRegion[]>([])
  const [ocrScanning, setOcrScanning] = useState(false)
  const [ocrHover, setOcrHover] = useState<number | null>(null)
  const [pendingRegion, setPendingRegion] = useState<OcrRegion | null>(null)
  const [railW, setRailW] = useState(168)
  const [sidebarW, setSidebarW] = useState(220)
  const [panelW, setPanelW] = useState(276)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [dirty, setDirty] = useState(false)

  const projRef = useRef(proj)
  const stageRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const undoR = useRef<Project[]>([])
  const redoR = useRef<Project[]>([])
  const mode = useRef<Mode>(null)
  const op = useRef<{
    start?: P
    id?: string
    hk?: HandleKey
    ep?: "start" | "end"
    base?: { x: number; y: number; w: number; h: number }
    rot0?: number
    r0?: number
    fs0?: number
    shape?: Ann | null
    changed?: boolean
    before?: Project
    moved?: boolean
    moveIds?: string[]
  }>({})
  const spaceDown = useRef(false)
  const editIdRef = useRef<string | null>(null)

  projRef.current = proj
  editIdRef.current = editId
  const page = proj.pages[proj.activePage]

  // ------------------------------------------------------------------- layout

  function layout(z = zoom, p = pan) {
    const { w, h } = stage
    if (!w || !page) return { s: 1, cssW: 0, cssH: 0, x: 0, y: 0 }
    const fit = Math.max(0.05, Math.min((w - 48) / page.w, (h - 48) / page.h, 1.6))
    const s = fit * z
    const cssW = page.w * s, cssH = page.h * s
    return { s, cssW, cssH, x: (w - cssW) / 2 + p.x, y: (h - cssH) / 2 + p.y }
  }

  function toPage(e: { clientX: number; clientY: number }): P {
    const cv = cvRef.current
    if (!cv) return { x: 0, y: 0 }
    const r = cv.getBoundingClientRect()
    const { s } = layout()
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }

  // ------------------------------------------------------------------- redraw

  const redraw = useCallback(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    const pg = projRef.current.pages[projRef.current.activePage]
    if (!ctx || !pg) return
    const { s, cssW, cssH } = layout()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
      cv.width = Math.round(cssW * dpr)
      cv.height = Math.round(cssH * dpr)
    }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, pg.w, pg.h)
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, pg.w, pg.h)
    for (const a of pg.annotations) if (a.visible !== false && a.id !== editIdRef.current) drawAnn(ctx, a, redraw)
    if (mode.current === "draw" && op.current.shape) drawAnn(ctx, op.current.shape)

    const sels = pg.annotations.filter((a) => sel.includes(a.id) && a.visible !== false)
    for (const a of sels) {
      drawSelection(ctx, a, s)
      if (sels.length === 1) {
        if (canRotAnn(a)) drawRotNub(ctx, a, s)
        if (isBoxAnn(a)) drawBoxNubs(ctx, a, s)
        else if (a.type === "line" || a.type === "arrow") drawLineNubs(ctx, a as LineAnn, s)
        else if (a.type === "text") drawTextNubs(ctx, a as TextAnn, s)
        if (a.type === "number") drawPointNub(ctx, (a as NumberAnn).x + (a as NumberAnn).r * 0.7, (a as NumberAnn).y - (a as NumberAnn).r * 0.7, s)
        if (a.type === "callout") drawPointNub(ctx, (a as CalloutAnn).tailX, (a as CalloutAnn).tailY, s)
      }
    }
    if (marquee) {
      ctx.strokeStyle = "#2563EB"
      ctx.lineWidth = 1.5 / s
      ctx.setLineDash([4 / s, 3 / s])
      ctx.strokeRect(marquee.x1, marquee.y1, marquee.x2 - marquee.x1, marquee.y2 - marquee.y1)
      ctx.setLineDash([])
    }
    if (cropRect) {
      ctx.save()
      ctx.strokeStyle = "#2563EB"
      ctx.lineWidth = 2 / s
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.restore()
    }
  }, [sel, zoom, pan, marquee, cropRect, stage])

  function nub(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = "#fff"
    ctx.strokeStyle = "#2563EB"
    ctx.lineWidth = 1.5
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    ctx.strokeRect(x - r, y - r, r * 2, r * 2)
  }
  function drawPointNub(ctx, x, y, s) { nub(ctx, x, y, 5 / s) }
  function drawBoxNubs(ctx, a, s) {
    for (const k of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as HandleKey[]) {
      const p = handlePos(a, k)
      if (p) drawPointNub(ctx, p.x, p.y, s)
    }
  }
  function drawLineNubs(ctx, l, s) { drawPointNub(ctx, l.x1, l.y1, s); drawPointNub(ctx, l.x2, l.y2, s) }
  function drawTextNubs(ctx, a, s) {
    const b = computeTextBounds(a)
    for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]) drawPointNub(ctx, x, y, s)
  }
  function drawRotNub(ctx, a, s) {
    const b = editBounds(a)
    const cx = b.x + b.w / 2
    const top = b.y - 26 / s
    ctx.strokeStyle = "#2563EB"
    ctx.lineWidth = 1.5 / s
    ctx.beginPath()
    ctx.moveTo(cx, b.y)
    ctx.lineTo(cx, top + 5 / s)
    ctx.stroke()
    ctx.fillStyle = "#2563EB"
    ctx.beginPath()
    ctx.arc(cx, top, 4.5 / s, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = "#fff"
    ctx.beginPath()
    ctx.arc(cx, top, 4.5 / s, 0, Math.PI * 2)
    ctx.stroke()
  }

  function handlePos(a: Ann, k: HandleKey): P | null {
    const b = editBounds(a)
    let x = b.x, y = b.y
    if (k === "n") { x = b.x + b.w / 2 }
    else if (k === "ne") { x = b.x + b.w }
    else if (k === "e") { x = b.x + b.w; y = b.y + b.h / 2 }
    else if (k === "se") { x = b.x + b.w; y = b.y + b.h }
    else if (k === "s") { x = b.x + b.w / 2; y = b.y + b.h }
    else if (k === "sw") { x = b.x; y = b.y + b.h }
    else if (k === "w") { x = b.x; y = b.y + b.h / 2 }
    return { x, y }
  }

  useEffect(() => { redraw() }, [proj, sel, zoom, pan, marquee, editText, cropRect, stage])

  // image per page
  useEffect(() => {
    const pg = proj.pages[proj.activePage]
    if (!pg) return
    const img = new Image()
    img.onload = () => { imgRef.current = img; redraw() }
    img.src = pg.dataUrl
  }, [proj.activePage])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setStage({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // native wheel (prevent browser zoom)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const r = el.getBoundingClientRect()
      const { s, x, y, cssW, cssH } = layout()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => {
          const nz = Math.max(0.05, Math.min(5, z * factor))
          const ns = s * (nz / z)
          const px = (mx - x) / s
          const py = (my - y) / s
          const nx = mx - px * ns
          const ny = my - py * ns
          setPan({ x: nx - (stage.w - cssW * (nz / z)) / 2 + (stage.w - page.w * ns) / 2, y: ny - (stage.h - cssH * (nz / z)) / 2 + (stage.h - page.h * ns) / 2 })
          return nz
        })
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [stage, page])

  const pickerRef = useRef<HTMLInputElement>(null)
  const regionImageRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (tool === "insertImage" || tool === "background") {
      pickerRef.current?.click()
    }
    if (tool !== "textEdit") {
      setOcrRegions([])
    } else {
      setOcrScanning(true)
      scanText(page.dataUrl, page.w, page.h)
        .then((regions) => setOcrRegions(regions))
        .catch(() => { setOcrRegions([]); onToast(t("scanFailed"), true) })
        .finally(() => setOcrScanning(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  // ------------------------------------------------------------------- history

  const snap = useCallback(() => cloneProj(projRef.current), [])
  const pushHist = (b: Project) => {
    undoR.current.push(b)
    if (undoR.current.length > 60) undoR.current.shift()
    redoR.current = []
  }

  function setSt(fn: (p: Project) => Project, hist: Project | null) {
    setProj((p) => {
      const n = fn(p)
      if (hist) pushHist(hist)
      setDirty(true)
      return n
    })
  }
  function undo() {
    if (!undoR.current.length) return
    redoR.current.push(snap())
    setProj(undoR.current.pop()!)
    setSel([]); setEditId(null); setDirty(true)
  }
  function redo() {
    if (!redoR.current.length) return
    undoR.current.push(snap())
    setProj(redoR.current.pop()!)
    setSel([]); setEditId(null); setDirty(true)
  }

  const addAnn = (a: Ann) => {
    const before = snap()
    setProj((p) => {
      const pages = p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: [...pg.annotations, JSON.parse(JSON.stringify(a))] } : pg))
      pushHist(before)
      setDirty(true)
      return { ...p, pages, updatedAt: Date.now() }
    })
    setSel([a.id])
    if (a.type === "text") { setEditId(a.id); setEditText((a as TextAnn).text || "") }
  }

  const updAnn = (id: string, patch: Partial<Ann>, hist: boolean) => {
    const before = hist ? snap() : null
    setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : pg)) }))
    if (before) pushHist(before)
    setDirty(true)
  }

  function updSel(patch: Partial<Ann>) {
    const before = snap()
    setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.map((x) => (sel.includes(x.id) ? { ...x, ...patch } : x)) } : pg)) }))
    pushHist(before)
    setDirty(true)
  }

  function removeSel() {
    if (!sel.length) return
    const before = snap()
    setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.filter((x) => !sel.includes(x.id)) } : pg)) }))
    pushHist(before)
    setSel([])
    setDirty(true)
  }
  function dupSel() {
    if (!sel.length) return
    const before = snap()
    setProj((p) => ({
      ...p, updatedAt: Date.now(),
      pages: p.pages.map((pg, i) => {
        if (i !== p.activePage) return pg
        const copies = pg.annotations.filter((x) => sel.includes(x.id)).map((x) => ({ ...JSON.parse(JSON.stringify(x)), id: uid("ann") }))
        return { ...pg, annotations: [...pg.annotations, ...copies] }
      }),
    }))
    pushHist(before)
    setDirty(true)
  }

  function rotateSel(deg: 90 | -90) {
    if (!sel.length) return
    const before = snap()
    setProj((p) => ({
      ...p, updatedAt: Date.now(),
      pages: p.pages.map((pg, i) => (i === p.activePage ? {
        ...pg, annotations: pg.annotations.map((x) => (sel.includes(x.id) ? { ...x, rotation: ((x.rotation || 0) + deg + 360) % 360 } : x)),
      } : pg)),
    }))
    pushHist(before)
    setDirty(true)
  }

  function flipSel(axis: "x" | "y") {
    if (!sel.length) return
    const key = axis === "x" ? "flipX" : "flipY"
    const before = snap()
    setProj((p) => ({
      ...p, updatedAt: Date.now(),
      pages: p.pages.map((pg, i) => (i === p.activePage ? {
        ...pg, annotations: pg.annotations.map((x) => (sel.includes(x.id) ? { ...x, [key]: !(x as any)[key] } : x)),
      } : pg)),
    }))
    pushHist(before)
    setDirty(true)
  }

  function lockSel() {
    if (!sel.length) return
    const before = snap()
    const target = !page.annotations.find((x) => x.id === sel[0])?.locked
    setProj((p) => ({
      ...p, updatedAt: Date.now(),
      pages: p.pages.map((pg, i) => (i === p.activePage ? {
        ...pg, annotations: pg.annotations.map((x) => (sel.includes(x.id) ? { ...x, locked: target } : x)),
      } : pg)),
    }))
    pushHist(before)
    setDirty(true)
  }

  function uploadBackground(file: File) {
    readImageFile(file, (dataUrl, w, h) => {
      const before = snap()
      setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, dataUrl, w, h } : pg)) }))
      pushHist(before)
      setDirty(true)
    })
  }

  async function applyCropNow() {
    if (!cropRect || cropRect.w < 4 || cropRect.h < 4) { setCropRect(null); setTool("select"); return }
    const before = snap()
    const cropped = applyCrop(page, cropRect)
    const newDataUrl = await cropDataUrl(page.dataUrl, page.w, page.h, cropRect)
    setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...cropped, dataUrl: newDataUrl } : pg)) }))
    pushHist(before)
    setDirty(true)
    setCropRect(null)
    setSel([])
    setTool("select")
  }

  function rightPanelOnLayers(id: string, action: string) {
    if (action === "toggle") updAnn(id, { visible: !page.annotations.find((x) => x.id === id)?.visible }, true)
    else if (action === "lock") updAnn(id, { locked: !page.annotations.find((x) => x.id === id)?.locked }, true)
    else if (action === "up" || action === "down") {
      const dir = action === "up" ? -1 : 1
      const before = snap()
      setProj((p) => {
        const pg = p.pages[p.activePage]
        const i = pg.annotations.findIndex((x) => x.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= pg.annotations.length) return p
        const arr = [...pg.annotations]
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t
        const pages = p.pages.map((x, k) => (k === p.activePage ? { ...x, annotations: arr } : x))
        return { ...p, pages }
      })
      pushHist(before)
      setDirty(true)
    } else if (action === "front" || action === "back") {
      const before = snap()
      setProj((p) => {
        const pg = p.pages[p.activePage]
        const i = pg.annotations.findIndex((x) => x.id === id)
        if (i < 0) return p
        const arr = [...pg.annotations]
        const [item] = arr.splice(i, 1)
        if (action === "front") arr.push(item)
        else arr.unshift(item)
        const pages = p.pages.map((x, k) => (k === p.activePage ? { ...x, annotations: arr } : x))
        return { ...p, pages }
      })
      pushHist(before)
      setDirty(true)
    } else if (action === "delete") { const before = snap(); setProj((p) => ({ ...p, pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.filter((x) => x.id !== id) } : pg)) })); pushHist(before); setSel((s) => s.filter((x) => x !== id)); setDirty(true) }
    else if (action === "select") setSel([id])
  }

  function dupAnnById(id: string) {
    const before = snap()
    setProj((p) => ({ ...p, pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: [...pg.annotations, { ...JSON.parse(JSON.stringify(pg.annotations.find((x) => x.id === id))), id: uid("ann") }] } : pg)) }))
    pushHist(before)
    setDirty(true)
  }

  function insertImageFile(file: File) {
    readImageFile(file, (dataUrl, w, h) => {
      const maxW = Math.min(w, page.w * 0.6)
      const scale = maxW / w
      const iw = w * scale, ih = h * scale
      const ix = Math.max(0, (page.w - iw) / 2)
      const iy = Math.max(0, (page.h - ih) / 2)
      addAnn(defaultAnn("image", { x: ix, y: iy, w: iw, h: ih, dataUrl } as Partial<Ann>))
      setTool("select")
    })
  }

  async function patchRegion(region: OcrRegion): Promise<BoxAnn> {
    const bgColor = await sampleEdgeColor(page.dataUrl, page.w, page.h, region)
    const pad = 3
    const patch = defaultAnn("rect", {
      x: region.x - pad, y: region.y - pad, w: region.w + pad * 2, h: region.h + pad * 2,
      stroke: "transparent", strokeWidth: 0,
    }) as BoxAnn
    patch.fill = bgColor
    return patch
  }

  async function activateOcrRegion(region: OcrRegion) {
    const before = snap()
    const patch = await patchRegion(region)
    const textAnn = defaultAnn("text", {
      x: region.x, y: region.y, text: region.text, fontSize: Math.max(10, Math.round(region.h * 0.75)),
    }) as TextAnn
    setProj((p) => {
      const pages = p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: [...pg.annotations, patch, textAnn] } : pg))
      return { ...p, pages, updatedAt: Date.now() }
    })
    pushHist(before)
    setDirty(true)
    setSel([textAnn.id])
    setEditId(textAnn.id)
    setEditText(textAnn.text)
    setOcrRegions((cur) => cur.filter((r) => r !== region))
    setPendingRegion(null)
  }

  async function coverRegionWithImage(region: OcrRegion, file: File) {
    const before = snap()
    const patch = await patchRegion(region)
    readImageFile(file, (dataUrl) => {
      const imgAnn = defaultAnn("image", { x: region.x, y: region.y, w: region.w, h: region.h, dataUrl } as Partial<Ann>) as ImageAnn
      setProj((p) => {
        const pages = p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: [...pg.annotations, patch, imgAnn] } : pg))
        return { ...p, pages, updatedAt: Date.now() }
      })
      pushHist(before)
      setDirty(true)
      setSel([imgAnn.id])
      setOcrRegions((cur) => cur.filter((r) => r !== region))
      setPendingRegion(null)
    })
  }

  function commitEdit() {
    const a = page?.annotations.find((x) => x.id === editId)
    if (a && a.type === "text") {
      const t = a as TextAnn
      const txt = editText.trim()
      if (!txt) {
        const before = snap()
        setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.filter((x) => x.id !== editId) } : pg)) }))
        pushHist(before)
        setSel((s) => s.filter((x) => x !== editId))
      } else if (txt !== t.text) {
        setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.map((x) => (x.id === editId ? { ...x, text: txt } : x)) } : pg)) }))
        setDirty(true)
      }
    }
    setEditId(null)
  }

  // ------------------------------------------------------------------- pointer

  function eraseAt(pt: P) {
    const s = layout().s
    const hit = page.annotations.find((a) => a.visible !== false && hitOne(pt, a, 8 / s))
    if (!hit) return
    setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.filter((x) => x.id !== hit.id) } : pg)) }))
    op.current.changed = true
  }

  function pDown(e: React.PointerEvent) {
    if (editId) commitEdit()
    try { (e.currentTarget as any).setPointerCapture(e.pointerId) } catch { }
    const pt = toPage(e)
    const tl = tool
    setMarquee(null)
    if (e.button === 1 || spaceDown.current || (e.button === 0 && e.altKey)) {
      spaceDown.current = false
      mode.current = "pan"
      op.current = { start: pt }
      return
    }
    if (tl === "select") {
      mode.current = null
      op.current = { start: pt }
      const s = layout().s
      const one = sel.length === 1 ? page.annotations.find((a) => a.id === sel[0]) : null
      if (one && one.visible !== false && !one.locked) {
        const b = editBounds(one)
        if (canRotAnn(one) && rotHitA(one, b, pt, s)) { mode.current = "rot"; op.current = { id: one.id, start: pt, rot0: one.rotation, before: snap() }; return }
        if (one.type === "callout" && tailHitA(one, pt, s)) { mode.current = "tail"; op.current = { id: one.id, start: pt, before: snap() }; return }
        if ((one.type === "line" || one.type === "arrow")) {
          const ep = endpointHitA(one, pt, s)
          if (ep) { mode.current = "endpoint"; op.current = { id: one.id, start: pt, ep, before: snap() }; return }
        }
        const hk = handleHitA(one, pt, s)
        if (hk) {
          mode.current = "resize"
          op.current = {
            id: one.id, hk, start: pt, base: editBounds(one),
            r0: one.type === "number" ? (one as NumberAnn).r : undefined,
            fs0: one.type === "text" ? (one as TextAnn).fontSize : undefined,
            rot0: one.rotation,
            before: snap(),
          }
          return
        }
      }
      const hit = [...page.annotations].reverse().find((a) => a.visible !== false && !a.locked && hitOne(pt, a, 5 / s))
      if (hit) {
        const multi = e.shiftKey || e.metaKey || e.ctrlKey
        setSel((cur) => (multi ? (cur.includes(hit.id) ? cur.filter((x) => x !== hit.id) : [...cur, hit.id]) : [hit.id]))
        if (!multi) { mode.current = "move"; op.current = { start: pt, before: snap(), moveIds: sel.includes(hit.id) ? sel : [hit.id] } }
        return
      }
      mode.current = "marquee"
      op.current = { start: pt, before: snap() }
      return
    }
    if (tl === "eraser") {
      mode.current = "erase"
      op.current = { start: pt, before: snap(), changed: false }
      eraseAt(pt)
      return
    }
    if (tl === "crop") {
      mode.current = "cropdraw"
      op.current = { start: pt }
      setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 })
      return
    }
    if (tl === "textEdit") {
      mode.current = "textdraw"
      op.current = { start: pt }
      setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 })
      return
    }
    // draw tool
    if (tl === "text") {
      addAnn(defaultAnn("text", { x: pt.x, y: pt.y, fontSize: 20 }))
      return
    }
    if (tl === "number") {
      const ns = page.annotations.filter((a) => a.type === "number") as NumberAnn[]
      const n = ns.length ? Math.max(...ns.map((x) => x.n)) + 1 : 1
      addAnn(defaultAnn("number", { x: pt.x, y: pt.y, n, r: 18 }))
      return
    }
    mode.current = "draw"
    op.current = { start: pt, changed: false, before: snap() }
    op.current.shape = draftFor(tl, color, sw, pt, pt)
  }

  function pMove(e: React.PointerEvent) {
    const m = mode.current
    if (!m) return
    const pt = toPage(e)
    const o = op.current
    if (m === "pan") { setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY })); return }
    if (m === "erase") { eraseAt(pt); return }
    if (m === "cropdraw" || m === "textdraw") {
      const s0 = o.start!
      setCropRect({ x: Math.min(s0.x, pt.x), y: Math.min(s0.y, pt.y), w: Math.abs(pt.x - s0.x), h: Math.abs(pt.y - s0.y) })
      return
    }
    if (m === "marquee") {
      const s0 = o.start!
      setMarquee({ x1: Math.min(s0.x, pt.x), y1: Math.min(s0.y, pt.y), x2: Math.max(s0.x, pt.x), y2: Math.max(s0.y, pt.y) })
      return
    }
    if (m === "draw") {
      const sh = o.shape
      if (!sh) return
      if (tool === "pen") (sh as PenAnn).points = [...(sh as PenAnn).points, pt]
      else o.shape = draftFor(tool, color, sw, o.start!, pt)
      o.changed = true
      redraw()
      return
    }
    if (m === "move") {
      const d = pt.x - o.start!.x
      const dy = pt.y - o.start!.y
      o.start = pt
      const ids = new Set(o.moveIds ?? sel)
      setProj((p) => ({
        ...p, updatedAt: Date.now(),
        pages: p.pages.map((pg, i) => {
          if (i !== p.activePage) return pg
          const anns = pg.annotations.map((a) => (ids.has(a.id) ? { ...a, ...movePatch(a, d, dy) } : a))
          return anns === pg.annotations ? pg : { ...pg, annotations: anns }
        }),
      }))
      o.changed = true
      return
    }
    if (m === "resize") {
      const a = page.annotations.find((x) => x.id === o.id)
      if (!a) return
      let patch: Partial<Ann>
      if (a.type === "number") patch = resizeNumber(a as NumberAnn, o.r0!, o.start!, pt)
      else if (a.type === "text") {
        const scale = o.base!.h > 4 ? (1 + (pt.y - o.start!.y) / o.base!.h) : 1
        patch = { fontSize: Math.max(8, Math.round((o.fs0 || 18) * scale)) }
      }
      else patch = resizeBox(o.base!, o.hk!, o.start!, pt)
      updAnn(o.id!, patch, false)
      o.changed = true
      return
    }
    if (m === "rot") {
      const a = page.annotations.find((x) => x.id === o.id)
      if (!a) return
      const rot = rotateValue(centerOf(editBounds(a)), o.rot0!, o.start!, pt)
      updAnn(o.id!, { rotation: rot }, false)
      o.changed = true
      return
    }
    if (m === "tail") {
      updAnn(o.id!, { tailX: pt.x, tailY: pt.y } as any, false)
      o.changed = true
      return
    }
    if (m === "endpoint") {
      updAnn(o.id!, o.ep === "end" ? { x2: pt.x, y2: pt.y } : { x1: pt.x, y1: pt.y }, false)
      o.changed = true
    }
  }

  function pUp(e: React.PointerEvent) {
    const m = mode.current
    const o = op.current
    if (m === "draw" && o.shape && o.changed && draftValid(o.shape)) {
      addAnn(o.shape)
    }
    if (m === "marquee" && marquee) {
      const found = page.annotations.filter((a) => a.visible !== false && intersects(a, marquee))
      setSel((cur) => (e.shiftKey ? [...new Set([...cur, ...found.map((x) => x.id)])] : found.map((x) => x.id)))
      setMarquee(null)
    }
    if (m === "textdraw") {
      if (cropRect && cropRect.w > 4 && cropRect.h > 4) {
        setPendingRegion({ text: "", x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h })
      }
      setCropRect(null)
    }
    if (m && m !== "draw" && m !== "marquee" && o.changed && o.before) pushHist(o.before)
    mode.current = null
    op.current = {}
    setDirty(true)
    redraw()
  }

  function intersects(a: Ann, q: { x1: number; y1: number; x2: number; y2: number }): boolean {
    const b = annBounds(a)
    return b.x < q.x2 && b.x + b.w > q.x1 && b.y < q.y2 && b.y + b.h > q.y1
  }

  // ------------------------------------------------------------------- save

  useEffect(() => {
    if (!dirty) return
    const id = setTimeout(async () => {
      const p = cloneProj(projRef.current)
      try {
        await upsertProject(p)
        onProject(p)
      } catch {
        onToast(t("storageFull"), true)
      }
      setDirty(false)
    }, 900)
    return () => clearTimeout(id)
  }, [dirty, proj])

  async function saveNow() {
    const p = cloneProj(projRef.current)
    try {
      await upsertProject(p)
      onProject(p)
    } catch {
      onToast(t("storageFull"), true)
      return
    }
    setDirty(false)
    onToast(t("saved"))
  }

  // ------------------------------------------------------------------- keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
        if (e.key === "Escape") { el.blur(); commitEdit() }
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveNow(); return }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dupSel(); return }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); return }
      if (e.key === "Escape") {
        if (pendingRegion) { setPendingRegion(null); return }
        if (tool === "textEdit") { setOcrRegions([]); setTool("select"); return }
        if (cropRect) { setCropRect(null); setTool("select"); return }
        if (editId) { commitEdit(); return }
        if (pop) { setPop(null); return }
        if (view === "preview") { setView("edit"); return }
        if (spaceDown.current) { spaceDown.current = false; return }
        setSel([])
        return
      }
      if (e.code === "Space") { e.preventDefault(); spaceDown.current = true }
      const tl = TOOL_KEY[e.key.toLowerCase()]
      if (tl) setTool(tl)
      if (e.key === "Enter" && editId) commitEdit()
    }
    const up = (e: KeyboardEvent) => { if (e.code === "Space") spaceDown.current = false }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", up)
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", up) }
  }, [editId, editText, pop, view, sel, proj, cropRect, tool, pendingRegion])

  // ------------------------------------------------------------------- pages

  const switchPage = (i: number) => { if (i !== proj.activePage) { setProj((p) => ({ ...p, activePage: i })); setSel([]) } }
  const addImage = (dataUrl: string, name: string, w: number, h: number) => {
    const pg: Page = { id: uid("pg"), title: name, imageName: name, dataUrl, w, h, annotations: [] }
    setProj((p) => ({ ...p, pages: [...p.pages, pg], activePage: p.pages.length }))
    setSel([])
  }
  const removePage = (i: number) => {
    if (proj.pages.length <= 1) return
    setProj((p) => ({ ...p, pages: p.pages.filter((_, j) => j !== i), activePage: Math.min(p.activePage, p.pages.length - 2) }))
    setSel([])
  }
  const deleteThisProject = async () => {
    await deleteProject(proj.id)
    onExit()
  }
  const dupPage = (i: number) => {
    const cp: Page = { ...cloneProj({ pages: [proj.pages[i]] } as any).pages[0], id: uid("pg") }
    setProj((p) => ({ ...p, pages: p.pages.flatMap((pg, j) => (j === i ? [pg, cp] : [pg])), activePage: i + 1 }))
    setSel([])
  }

  // ------------------------------------------------------------------- render

  const selAnn = sel.length === 1 ? page.annotations.find((a) => a.id === sel[0]) : null
  const lr = layout()
  const previewing = view === "preview"

  if (previewing) {
    return <Preview project={proj} onBack={() => setView("edit")} onExport={() => setPop("export")} onToast={onToast} />
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: th.bg, color: th.text, fontFamily: "Inter, -apple-system, sans-serif" }}>
      <Header
        name={page?.title || "Untitled"}
        pageCount={proj.pages.length}
        dirty={dirty || !!editId}
        onHome={onExit}
        canUndo={undoR.current.length > 0}
        canRedo={redoR.current.length > 0}
        onUndo={undo}
        onRedo={redo}
        onSave={saveNow}
        onPreview={() => setView("preview")}
        onExport={() => setPop("export")}
      />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: railW, flexShrink: 0, borderRight: `1px solid ${HEADER_BORDER}`, minHeight: 0 }}>
          <ToolbarBar tool={tool} setTool={setTool} color={color} setColor={setColor} sw={sw} setSw={setSw} />
        </div>
        <Resizer width={railW} setWidth={setRailW} min={140} max={320} />
        <div style={{ width: sidebarW, flexShrink: 0, borderRight: `1px solid ${th.border}`, minHeight: 0 }}>
          <PagesLayersColumn
            proj={proj}
            onSwitch={switchPage}
            onAdd={addImage}
            onRemove={removePage}
            onDeleteProject={deleteThisProject}
            sel={sel}
            onSel={(id, mult) => setSel((cur) => (mult ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]))}
            onLayers={rightPanelOnLayers}
            onDup={dupAnnById}
          />
        </div>
        <Resizer width={sidebarW} setWidth={setSidebarW} min={160} max={420} />
        <div ref={stageRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: th.mode === "dark" ? "#0A0B10" : "#ECEDF2", touchAction: "none" }}>
          <CanvasToolbar
            hasSel={sel.length > 0}
            locked={sel.length === 1 ? !!page.annotations.find((a) => a.id === sel[0])?.locked : false}
            tool={tool}
            onCrop={() => setTool(tool === "crop" ? "select" : "crop")}
            onRotate={rotateSel}
            onFlip={flipSel}
            onLock={lockSel}
            onDelete={removeSel}
          />
          {cropRect && tool === "crop" && (
            <button onClick={applyCropNow} style={{ position: "absolute", top: 10, right: 10, zIndex: 10, padding: "8px 16px", borderRadius: 8, border: "none", background: th.accent, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {t("applyCrop")}
            </button>
          )}
          {tool === "textEdit" && ocrScanning && (
            <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 10, padding: "8px 16px", borderRadius: 8, background: th.surface, border: `1px solid ${th.border}`, fontSize: 12.5, fontWeight: 600, color: th.text, boxShadow: th.shadow }}>
              {t("scanningText")}
            </div>
          )}
          <div style={{ position: "absolute", left: lr.x, top: lr.y, width: lr.cssW, height: lr.cssH, boxShadow: th.shadowLg }}>
            <canvas
              ref={cvRef}
              style={{ width: "100%", height: "100%", display: "block", cursor: tool === "select" ? (spaceDown.current ? "grabbing" : "default") : "crosshair", touchAction: "none" }}
              onPointerDown={pDown}
              onPointerMove={pMove}
              onPointerUp={pUp}
              onPointerCancel={pUp}
            />
            {editId && <TextOverlay page={page} annId={editId} value={editText} setValue={setEditText} onDone={commitEdit} scale={lr.s} />}
            <input
              ref={pickerRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  if (tool === "insertImage") insertImageFile(f)
                  else if (tool === "background") uploadBackground(f)
                }
                e.target.value = ""
                if (tool === "background") setTool("select")
              }}
            />
            {tool === "textEdit" && ocrRegions.map((r, i) => (
              <div
                key={i}
                onClick={() => setPendingRegion(r)}
                onMouseEnter={() => setOcrHover(i)}
                onMouseLeave={() => setOcrHover((cur) => (cur === i ? null : cur))}
                title={r.text}
                style={{
                  position: "absolute",
                  left: r.x * lr.s, top: r.y * lr.s, width: r.w * lr.s, height: r.h * lr.s,
                  border: ocrHover === i ? `1.5px dashed ${th.accent}` : "1.5px dashed transparent",
                  background: ocrHover === i ? "rgba(37,99,235,.18)" : "transparent",
                  cursor: "pointer",
                }}
              />
            ))}
            {pendingRegion && (
              <div
                style={{
                  position: "absolute",
                  left: pendingRegion.x * lr.s,
                  top: Math.max(0, pendingRegion.y * lr.s - 34),
                  display: "flex", gap: 4, zIndex: 20,
                  background: th.surface, border: `1px solid ${th.border}`, borderRadius: 8, padding: 3, boxShadow: th.shadow,
                }}
              >
                <button
                  onClick={() => activateOcrRegion(pendingRegion)}
                  title={t("toolText")}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 6, border: "none", background: "transparent", color: th.text, fontSize: 11.5, cursor: "pointer" }}
                >
                  {I.text} {t("toolText")}
                </button>
                <button
                  onClick={() => regionImageRef.current?.click()}
                  title={t("toolInsertImage")}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 6, border: "none", background: "transparent", color: th.text, fontSize: 11.5, cursor: "pointer" }}
                >
                  {I.insertImage} {t("toolInsertImage")}
                </button>
                <button
                  onClick={() => setPendingRegion(null)}
                  title={t("cancel")}
                  style={{ display: "flex", alignItems: "center", padding: "5px 6px", borderRadius: 6, border: "none", background: "transparent", color: th.textFaint, cursor: "pointer" }}
                >
                  {I.close}
                </button>
                <input
                  ref={regionImageRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && pendingRegion) coverRegionWithImage(pendingRegion, f)
                    e.target.value = ""
                  }}
                />
              </div>
            )}
          </div>
        </div>
        <Resizer width={panelW} setWidth={setPanelW} min={220} max={480} invert />
        <div style={{ width: panelW, flexShrink: 0, borderLeft: `1px solid ${th.border}`, minHeight: 0 }}>
          <RightPanel
            page={page}
            sel={sel}
            ann={selAnn}
            sw={sw}
            color={color}
            zoom={zoom}
            tab={tabs}
            setTab={setTabs}
            onPatch={(patch) => { const a = selAnn; if (a) updAnn(a.id, patch, true) }}
            onColor={setColor}
            onSw={setSw}
            onZoom={setZoom}
            onFit={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
            onLayers={rightPanelOnLayers}
            onSel={(id, mult) => setSel((cur) => (mult ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]))}
            onDup={dupAnnById}
          />
        </div>
      </div>
      <BottomBar
        proj={proj}
        zoom={zoom}
        onZoom={setZoom}
        onFit={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
        onSwitch={switchPage}
        onRemove={removePage}
        onDup={dupPage}
        extra={headerExtra}
      />
      {pop === "export" && <ExportModal project={proj} onClose={() => setPop(null)} onToast={onToast} />}
    </div>
  )
}

// ------------------------------------------------------------------ chrome

const HEADER_BG = "#0B1220"
const HEADER_BORDER = "#1E2A3F"

function Header({ name, pageCount, dirty, canUndo, canRedo, onHome, onUndo, onRedo, onSave, onPreview, onExport }) {
  const th = useTheme()
  const { t } = useT()
  const pill = { padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", background: "#fff", color: "#111", display: "inline-flex", alignItems: "center", gap: 5 }
  const iconBtn = { width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer", background: "#fff", color: "#111", display: "inline-flex", alignItems: "center", justifyContent: "center" }
  return (
    <header style={{ height: 52, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", background: HEADER_BG, borderBottom: `1px solid ${HEADER_BORDER}` }}>
      <button onClick={onHome} style={pill} title={t("home")}>{I.home} {t("home")}</button>
      <div style={{ width: 1, height: 22, background: HEADER_BORDER }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", color: "#fff" }}>{t("appName")}</span>
        <span style={{ color: "#5B6B85", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: "#C7D0DE", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{name}</span>
        {pageCount > 1 && <span style={{ fontSize: 11, color: "#C7D0DE", background: "#1E2A3F", borderRadius: 6, padding: "2px 7px" }}>{pageCount} {t("pages")}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, color: dirty ? "#F59E0B" : "#4ADE80", fontWeight: 600, marginRight: 4 }}>
        ● {dirty ? t("unsaved") : t("saved")}
      </span>
      <button onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)" style={{ ...iconBtn, opacity: canUndo ? 1 : 0.4 }}>{I.undo}</button>
      <button onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)" style={{ ...iconBtn, opacity: canRedo ? 1 : 0.4 }}>{I.redo}</button>
      <div style={{ width: 1, height: 22, background: HEADER_BORDER }} />
      <button onClick={onSave} title="Save (⌘S)" style={pill}>{I.save} {t("save")}</button>
      <button onClick={onPreview} title={t("preview")} style={pill}>{I.preview} {t("preview")}</button>
      <button onClick={onExport} title={t("export")} style={{ ...pill, background: th.accent, color: "#fff" }}>{I.export} {t("export")}</button>
    </header>
  )
}

function Resizer({ width, setWidth, min = 120, max = 480, invert = false }: { width: number; setWidth: (n: number) => void; min?: number; max?: number; invert?: boolean }) {
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault()
        const startX = e.clientX
        const startW = width
        const move = (ev: PointerEvent) => {
          const dx = (ev.clientX - startX) * (invert ? -1 : 1)
          setWidth(Math.max(min, Math.min(max, startW + dx)))
        }
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up)
      }}
      style={{ width: 6, flexShrink: 0, cursor: "col-resize", position: "relative", zIndex: 5 }}
    >
      <div style={{ position: "absolute", left: 2, top: 0, bottom: 0, width: 1, background: "transparent" }} />
    </div>
  )
}

const TOOL_LABEL_KEY: Record<string, string> = {
  select: "toolSelect", rect: "toolRect", rrect: "toolRrect", ellipse: "toolEllipse", arrow: "toolArrow",
  line: "toolLine", text: "toolText", number: "toolNumber", callout: "toolCallout", highlight: "toolHighlight",
  blur: "toolBlur", pixelate: "toolPixelate", eraser: "toolEraser", pen: "toolPen", crop: "toolCrop",
  insertImage: "toolInsertImage", background: "toolBackground", textEdit: "toolTextEdit",
}

function ToolbarBar({ tool, setTool, color, setColor, sw, setSw }) {
  const th = useTheme()
  const { t } = useT()
  return (
    <aside style={{ width: "100%", height: "100%", background: HEADER_BG, display: "flex", flexDirection: "column", padding: "10px 8px", gap: 1, overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#5B6B85", textTransform: "uppercase", letterSpacing: ".5px", padding: "0 6px 6px" }}>{t("tools")}</div>
      {TOOLS.map((tl) => {
        const label = t(TOOL_LABEL_KEY[tl.t] || tl.t, undefined, tl.label)
        return (
          <button
            key={tl.t}
            onClick={() => setTool(tl.t)}
            title={label + (tl.key ? ` (${tl.key})` : "")}
            style={{
              display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left",
              background: tool === tl.t ? th.accent : "transparent",
              color: "#fff",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, flexShrink: 0 }}>{tl.icon}</span>
            <span style={{ fontSize: 12.5, fontWeight: tool === tl.t ? 600 : 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
            {tool === tl.t ? <span style={{ opacity: .85 }}>{I.chevD}</span> : tl.key && <span style={{ fontSize: 10, color: "#5B6B85" }}>{tl.key}</span>}
          </button>
        )
      })}
      <div style={{ height: 1, background: HEADER_BORDER, margin: "8px 4px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px" }}>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Annotation color"
          style={{ width: 26, height: 26, border: `1px solid ${HEADER_BORDER}`, borderRadius: 7, padding: 1, cursor: "pointer", background: "#fff" }} />
        {SWATCHES.map((c) => (
          <button key={c} onClick={() => setColor(c)} title={c}
            style={{ width: 14, height: 14, borderRadius: 4, background: c, border: c === "#FFFFFF" ? `1px solid ${HEADER_BORDER}` : "none", cursor: "pointer", padding: 0, outline: color.toLowerCase() === c.toLowerCase() ? `2px solid ${th.accent}` : "none" }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 6px 0" }}>
        <span style={{ fontSize: 11, color: "#C7D0DE" }}>{t("strokeWidth")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={1} max={24} value={sw} onChange={(e) => setSw(+e.target.value)} title={t("strokeWidth")}
            style={{ flex: 1, accentColor: th.accent }} />
          <input type="number" min={1} max={24} value={sw} onChange={(e) => setSw(Math.max(1, Math.min(24, +e.target.value || 1)))}
            style={{ width: 36, fontSize: 11, color: "#111", fontWeight: 600, textAlign: "center", border: `1px solid ${HEADER_BORDER}`, borderRadius: 5, background: "#fff", padding: "3px 2px" }} />
        </div>
      </div>
    </aside>
  )
}

function BottomBar({ proj, zoom, onZoom, onFit, onSwitch, onRemove, onDup, extra }) {
  const th = useTheme()
  const { t } = useT()
  const chip = { padding: "5px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: `1px solid ${th.border}`, background: th.surface, color: th.text }

  return (
    <footer style={{ height: 42, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 12px", background: th.surface, borderTop: `1px solid ${th.border}` }}>
      <span style={{ fontSize: 12, color: th.textMuted }}>{proj.pages[proj.activePage]?.w}×{proj.pages[proj.activePage]?.h}px</span>
      <span style={{ fontSize: 12, color: th.textFaint }}>·</span>
      <span style={{ fontSize: 12, color: th.textMuted }}>{proj.pages[proj.activePage]?.annotations.length || 0} objects</span>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5, overflowX: "auto" }}>
        {proj.pages.map((pg, i) => (
          <div key={pg.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 6px", borderRadius: 7, background: i === proj.activePage ? th.accentSoft : "transparent", border: "1px solid " + (i === proj.activePage ? th.accentBorder : "transparent"), cursor: "pointer", fontSize: 12 }}
            onClick={() => onSwitch(i)} title={pg.title}>
            <span style={{ fontWeight: 700, color: i === proj.activePage ? th.accent : th.textMuted }}>{i + 1}</span>
            <span style={{ color: th.textMuted, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg.title}</span>
            {proj.pages.length > 1 && (
              <span onClick={(e) => { e.stopPropagation(); onRemove(i) }} title={t("removePage")} style={{ color: th.textFaint, marginLeft: 2, cursor: "pointer" }}>×</span>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => onZoom(Math.max(0.05, zoom / 1.2))} title="Zoom out" style={chip}>{I.zoomOut}</button>
      <button onClick={onFit} title={t("fitToScreen")} style={{ ...chip, fontWeight: 700 }}>{Math.round(zoom * 100)}%</button>
      <button onClick={() => onZoom(Math.min(5, zoom * 1.2))} title="Zoom in" style={chip}>{I.zoomIn}</button>
    </footer>
  )
}

function TextOverlay({ page, annId, value, setValue, onDone, scale = 1 }) {
  const ann = page?.annotations.find((a) => a.id === annId) as TextAnn | undefined
  if (!ann) return null
  const s = scale

  // measure in image-space, then scale to CSS pixels
  const mc = document.createElement("canvas")
  const c2 = mc.getContext("2d")
  mc.width = 2; mc.height = 2
  if (c2) c2.font = `${ann.fontWeight} ${ann.fontSize}px Inter, -apple-system, sans-serif`
  const lines = (value || "M").split("\n")
  const maxLineW = lines.reduce((mx, l) => Math.max(mx, c2 ? c2.measureText(l || "M").width : 120), 80)
  const wpxImg = ann.width ?? Math.max(80, maxLineW + ann.padding * 2 + 8)
  const hpxImg = Math.max(ann.fontSize * 1.5, lines.length * ann.fontSize * 1.4 + ann.padding * 2)

  return (
    <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onDone() }
        }}
        placeholder="Type text…"
        style={{
          pointerEvents: "auto",
          position: "absolute",
          left: ann.x * s,
          top: ann.y * s,
          width: wpxImg * s,
          minHeight: hpxImg * s,
          border: `${Math.max(1, 1.5 / s)}px dashed #5956D6`,
          borderRadius: ann.radius * s,
          background: ann.bg === "transparent" ? "transparent" : ann.bg,
          color: ann.color,
          fontSize: ann.fontSize * s,
          fontWeight: ann.fontWeight,
          lineHeight: 1.4,
          textAlign: ann.align,
          padding: ann.padding * s,
          boxSizing: "border-box",
          outline: "none",
          fontFamily: "Inter, -apple-system, sans-serif",
          resize: "none",
          overflow: "hidden",
          caretColor: ann.color,
        }}
      />
    </div>
  )
}

function stageOf(page) {
  return page ? {} : null
}

