import { useCallback, useEffect, useRef, useState } from "react"
import type { Project, Page } from "./types"
import { drawAnn, preloadAnnImages } from "./draw"
import { I } from "./icons"
import { jsPDF } from "jspdf"
import { useTheme } from "./theme"
import { useT } from "./translations"

type Format = "png" | "jpg" | "webp" | "pdf"
type BG = "transparent" | "white" | "black"

async function renderPageCanvas(pg: Page, scale: number, bg: BG): Promise<HTMLCanvasElement> {
  const cv = document.createElement("canvas")
  cv.width = Math.round(pg.w * scale)
  cv.height = Math.round(pg.h * scale)
  const ctx = cv.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  if (bg === "white") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height) }
  if (bg === "black") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height) }
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  await preloadAnnImages(pg.annotations)
  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, pg.w, pg.h)
    for (const a of pg.annotations) if (a.visible !== false) drawAnn(ctx, a)
    cv.dispatchEvent(new Event("ann:ready"))
  }
  img.src = pg.dataUrl
  return cv
}

function canvasToBlob(cv: HTMLCanvasElement, format: Format, quality = 0.9): Promise<Blob | null> {
  return new Promise((res) => {
    if (format === "png") cv.toBlob(res, "image/png")
    else if (format === "jpg") cv.toBlob(res, "image/jpeg", quality)
    else cv.toBlob(res, "image/webp", quality)
  })
}

interface EProps {
  project: Project
  onClose: () => void
  onToast: (m: string, e?: boolean) => void
}

export default function ExportModal({ project, onClose, onToast }: EProps) {
  const th = useTheme()
  const { t } = useT()
  const [format, setFormat] = useState<Format>("png")
  const [scale, setScale] = useState(1)
  const [quality, setQuality] = useState(90)
  const [bg, setBg] = useState<BG>("transparent")
  const [busy, setBusy] = useState(false)
  const [allPages, setAllPages] = useState(project.pages.length > 1)
  const pdfMode = format === "pdf"

  const doExport = async () => {
    setBusy(true)
    try {
      if (format === "pdf") {
        const pdf = new jsPDF({ orientation: project.pages[0]?.w > project.pages[0]?.h ? "landscape" : "portrait", unit: "mm", format: "a4" })
        for (let i = 0; i < project.pages.length; i++) {
          const pg = project.pages[i]
          const s1 = pdfScale(pg)
          const cv = await renderPageCanvas(pg, s1, bg)
          await ready(cv)
          const jpeg = cv.toDataURL("image/jpeg", 0.92)
          const pw = pdf.internal.pageSize.getWidth()
          const ph = pdf.internal.pageSize.getHeight()
          const k = Math.min(pw / (pg.w * s1), ph / (pg.h * s1))
          const dw = (pg.w * s1) * k
          const dh = (pg.h * s1) * k
          pdf.addImage(jpeg, "JPEG", (pw - dw) / 2, (ph - dh) / 2, dw, dh, undefined, "FAST")
          if (i < project.pages.length - 1) pdf.addPage()
        }
        pdf.save(project.name + ".pdf")
        onToast(t("exported"))
      } else {
        const pages = allPages && project.pages.length > 1 ? project.pages : [project.pages[project.activePage]]
        const ext = format === "jpg" ? "jpg" : format === "webp" ? "webp" : "png"
        for (let i = 0; i < pages.length; i++) {
          const cv = await renderPageCanvas(pages[i], scale, bg)
          await ready(cv)
          const blob = await canvasToBlob(cv, format, quality / 100)
          if (blob) {
            const url = URL.createObjectURL(blob)
            const multi = pages.length > 1 ? `-${i + 1}` : ""
            downloadUrl(url, `${project.name}${multi}.${ext}`)
            setTimeout(() => URL.revokeObjectURL(url), 4000)
          }
        }
        onToast(t("exported"))
      }
    } catch (err) {
      onToast(t("exportFailed"), true)
    }
    setBusy(false)
  }

  const oBox = { border: `1px solid ${th.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", background: th.surface, color: th.text }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,.5)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, background: th.surface, borderRadius: 14, boxShadow: "0 24px 70px rgba(0,0,0,.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${th.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: th.text }}>{t("exportTitle")}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: th.textMuted }}>{I.close}</button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 6 }}>{t("format")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
              {(["png", "jpg", "webp", "pdf"] as Format[]).map((f) => (
                <button key={f} onClick={() => setFormat(f)} style={{ ...oBox, textTransform: "uppercase", fontWeight: format === f ? 700 : 500, borderColor: format === f ? th.accent : th.border, background: format === f ? th.accentSoft : th.surface }}>{f}</button>
              ))}
            </div>
          </div>
          {format === "pdf" ? (
            <div style={{ fontSize: 12, color: th.textMuted }}>{t("allPagesCombined", { count: project.pages.length })}</div>
          ) : (
            <>
              {project.pages.length > 1 && (
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} style={{ accentColor: th.accent }} />
                  {t("exportAllPages", { count: project.pages.length })}
                </label>
              )}
              {format === "png" && (
                <div>
                  <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 6 }}>{t("resolution")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[1, 2].map((s) => (
                      <button key={s} onClick={() => setScale(s)} style={{ ...oBox, fontWeight: scale === s ? 700 : 500, borderColor: scale === s ? th.accent : th.border, background: scale === s ? th.accentSoft : th.surface }}>
                        {s}x ({Math.round((project.pages[project.activePage]?.w * s) || 0)}px)
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {format === "jpg" && (
                <div>
                  <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 4 }}>{t("quality", { value: quality })}</div>
                  <input type="range" min={50} max={100} value={quality} onChange={(e) => setQuality(+e.target.value)} style={{ width: "100%", accentColor: th.accent }} />
                </div>
              )}
            </>
          )}
          <div>
            <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 6 }}>{t("background")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["transparent", "white", "black"] as BG[]).map((b) => (
                <button key={b} onClick={() => setBg(b)} style={{ ...oBox, textTransform: "capitalize", borderColor: bg === b ? th.accent : th.border, background: bg === b ? th.accentSoft : th.surface }}>{b}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: `1px solid ${th.border}` }}>
          <button onClick={onClose} style={oBox}>{t("cancel")}</button>
          <button onClick={doExport} disabled={busy} style={{ ...oBox, background: th.accent, color: "#fff", border: "none", fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
            {busy ? t("exporting") : t("export")}
          </button>
        </div>
      </div>
    </div>
  )
}

// preview panel
export function Preview({ project, onBack, onExport, onToast }) {
  const th = useTheme()
  const { t } = useT()
  const [url, setUrl] = useState("")
  const pg = project.pages[project.activePage]
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cv = await renderPageCanvas(pg, 1, "white")
      const onReady = () => { if (!cancelled) setUrl(cv.toDataURL("image/png")) }
      cv.addEventListener("ann:ready", onReady)
    })()
    return () => { cancelled = true }
  }, [pg])

  const doDownload = async () => {
    const cv = await renderPageCanvas(pg, 1, "transparent")
    cv.addEventListener("ann:ready", () => downloadUrl(cv.toDataURL("image/png"), `${project.name}.png`))
  }

  const btn = { border: `1px solid ${th.border}`, background: th.surface, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: th.text }
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: th.surfaceAlt }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", background: th.surface, borderBottom: `1px solid ${th.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: th.text }}>{t("preview")} — {project.name}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onBack} style={btn}>{t("backToEditor")}</button>
          <button onClick={doDownload} style={{ ...btn, background: th.accent, color: "#fff", border: "none" }}>{t("downloadPngShort")}</button>
          <button onClick={onExport} style={btn}>{t("exportOptions")}</button>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", padding: 30 }}>
        {url ? <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.25)", borderRadius: 4 }} /> : <span style={{ color: th.textFaint, fontSize: 13 }}>{t("rendering")}</span>}
      </div>
    </div>
  )
}

// helpers
function ready(cv: HTMLCanvasElement): Promise<void> {
  return new Promise((res) => {
    const doc = cv as any
    if (doc.__imgDone) return res()
    const h = () => { doc.__imgDone = true; res() }
    cv.addEventListener("ann:ready", h, { once: true })
    setTimeout(h, 1500)
  })
}

function downloadUrl(url, name) {
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function pdfScale(pg: Page) {
  return Math.min(1, (210 * 3.78) / pg.w, (297 * 3.78) / pg.h)
}