import { createWorker } from "tesseract.js"

export interface OcrRegion {
  text: string
  x: number
  y: number
  w: number
  h: number
}

let workerPromise: ReturnType<typeof createWorker> | null = null

function getWorker() {
  if (!workerPromise) workerPromise = createWorker("eng")
  return workerPromise
}

function renderToCanvas(dataUrl: string, w: number, h: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement("canvas")
      cv.width = Math.max(1, Math.round(w))
      cv.height = Math.max(1, Math.round(h))
      const ctx = cv.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)
      resolve(cv)
    }
    img.onerror = () => reject(new Error("scanText: failed to load source image"))
    img.src = dataUrl
  })
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
}

export async function sampleEdgeColor(dataUrl: string, pageW: number, pageH: number, region: { x: number; y: number; w: number; h: number }): Promise<string> {
  const cv = await renderToCanvas(dataUrl, pageW, pageH)
  const ctx = cv.getContext("2d")!
  const pad = 4
  const samples: [number, number][] = [
    [region.x - pad, region.y + region.h / 2],
    [region.x + region.w + pad, region.y + region.h / 2],
    [region.x + region.w / 2, region.y - pad],
    [region.x + region.w / 2, region.y + region.h + pad],
  ]
  let r = 0, g = 0, b = 0, n = 0
  for (const [sx, sy] of samples) {
    const x = Math.max(0, Math.min(cv.width - 1, Math.round(sx)))
    const y = Math.max(0, Math.min(cv.height - 1, Math.round(sy)))
    const [pr, pg, pb] = ctx.getImageData(x, y, 1, 1).data
    r += pr; g += pg; b += pb; n++
  }
  if (n === 0) return "#FFFFFF"
  return `#${toHex(r / n)}${toHex(g / n)}${toHex(b / n)}`
}

export async function scanText(dataUrl: string, w: number, h: number): Promise<OcrRegion[]> {
  const cv = await renderToCanvas(dataUrl, w, h)
  const worker = await getWorker()
  const { data } = await worker.recognize(cv, {}, { blocks: true, text: true })
  const regions: OcrRegion[] = []
  const seen = new Set<string>()
  const add = (text: string, b: { x0: number; y0: number; x1: number; y1: number }) => {
    const clean = text.trim()
    if (!clean) return
    const bw = b.x1 - b.x0
    const bh = b.y1 - b.y0
    if (bw < 4 || bh < 4) return
    const key = `${b.x0},${b.y0},${b.x1},${b.y1}`
    if (seen.has(key)) return
    seen.add(key)
    regions.push({ text: clean, x: b.x0, y: b.y0, w: bw, h: bh })
  }
  for (const block of data.blocks || []) {
    let blockHadLines = false
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        if (line.text.trim()) blockHadLines = true
        add(line.text, line.bbox)
      }
    }
    // Large stylized/heading text sometimes fails paragraph/line segmentation
    // entirely even though the block itself carries recognized text — fall
    // back to the whole block so it still becomes clickable.
    if (!blockHadLines) add(block.text, block.bbox)
  }
  return regions
}
