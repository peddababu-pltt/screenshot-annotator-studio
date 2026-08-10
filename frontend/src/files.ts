export function readImageFile(file: File, cb: (dataUrl: string, w: number, h: number, name: string) => void) {
  const rd = new FileReader()
  rd.onload = () => {
    const img = new Image()
    img.onload = () => cb(String(rd.result), img.width, img.height, file.name)
    img.src = String(rd.result)
  }
  rd.readAsDataURL(file)
}

export function blankCanvasDataUrl(w: number, h: number): string {
  const cv = document.createElement("canvas")
  cv.width = Math.max(1, Math.round(w))
  cv.height = Math.max(1, Math.round(h))
  const ctx = cv.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, cv.width, cv.height)
  return cv.toDataURL("image/png")
}

export function cropDataUrl(dataUrl: string, pageW: number, pageH: number, rect: { x: number; y: number; w: number; h: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const full = document.createElement("canvas")
      full.width = Math.max(1, Math.round(pageW))
      full.height = Math.max(1, Math.round(pageH))
      const fctx = full.getContext("2d")!
      fctx.drawImage(img, 0, 0, pageW, pageH)
      const cw = Math.max(1, Math.round(rect.w))
      const ch = Math.max(1, Math.round(rect.h))
      const out = document.createElement("canvas")
      out.width = cw
      out.height = ch
      const octx = out.getContext("2d")!
      octx.drawImage(full, rect.x, rect.y, cw, ch, 0, 0, cw, ch)
      resolve(out.toDataURL("image/png"))
    }
    img.onerror = () => reject(new Error("cropDataUrl: failed to load source image"))
    img.src = dataUrl
  })
}
