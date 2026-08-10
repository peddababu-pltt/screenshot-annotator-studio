import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Project } from "./types"
import { listProjects, deleteProject, upsertProject } from "./persist"
import { I } from "./icons"
import { readImageFile } from "./files"
import { drawAnn, preloadAnnImages } from "./draw"
import { useTheme, type Theme } from "./theme"
import { useT } from "./translations"

function FeatureCard({ th, icon, iconBg, iconColor, title, desc }: { th: Theme; icon: any; iconBg: string; iconColor: string; title: string; desc: string }) {
  return (
    <div style={{ flex: "1 1 200px", minWidth: 200, display: "flex", gap: 10, padding: 14, borderRadius: 12, background: th.surface, border: `1px solid ${th.border}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: th.textMuted, lineHeight: 1.4, marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  )
}

function HomeSidebar({ th, t }: { th: Theme; t: (k: string, v?: any) => string }) {
  const label = { fontSize: 11, fontWeight: 700, color: th.textFaint, textTransform: "uppercase" as const, letterSpacing: ".5px", marginBottom: 12 }
  const step = { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, marginBottom: 14, color: th.text }
  const bullet = { width: 20, height: 20, borderRadius: "50%", background: th.accentSoft, color: th.accent, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }
  const kbd = { fontFamily: "monospace", fontSize: 11, background: th.surfaceAlt, borderRadius: 5, padding: "2px 7px", color: th.text }
  return (
    <aside style={{ width: 268, minWidth: 268, padding: "28px 20px 24px 24px", display: "flex", flexDirection: "column" }}>
      <div style={label}>{t("getStarted")}</div>
      <div style={step}><span style={bullet}>1</span><span>{t("step1")}</span></div>
      <div style={step}><span style={bullet}>2</span><span>{t("step2")}</span></div>
      <div style={{ ...step, marginBottom: 0 }}><span style={bullet}>3</span><span>{t("step3")}</span></div>

      <div style={{ height: 32 }} />

      <div style={label}>{t("shortcuts")}</div>
      {[["⌘Z", "scUndo"], ["⌘⇧Z", "scRedo"], ["⌘S", "scSave"], ["⌘D", "scDuplicate"], ["Del", "scDelete"]].map(([keys, key]) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0", color: th.textMuted }}>
          <span>{t(key)}</span>
          <span style={kbd}>{keys}</span>
        </div>
      ))}
    </aside>
  )
}

async function quickDownload(p: Project) {
  const pg = p.pages[0]
  if (!pg) return
  const cv = document.createElement("canvas")
  cv.width = pg.w
  cv.height = pg.h
  const ctx = cv.getContext("2d")!
  await preloadAnnImages(pg.annotations)
  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, pg.w, pg.h)
    for (const a of pg.annotations) if (a.visible !== false) drawAnn(ctx, a)
    const a = document.createElement("a")
    a.href = cv.toDataURL("image/png")
    a.download = `${p.name}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  img.src = pg.dataUrl
}

interface Props {
  projects: Project[]
  onNew: (p: Project) => void
  onOpen: (p: Project) => void
  onToast: (m: string, e?: boolean) => void
  headerExtra?: ReactNode
}

export default function Home({ projects: ext, onNew, onOpen, onToast, headerExtra }: Props) {
  const [projects, setProjects] = useState<Project[]>(ext)
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const th = useTheme()
  const { t } = useT()

  useEffect(() => {
    setProjects(ext)
  }, [ext])

  const create = async (dataUrl: string, name: string, w: number, h: number) => {
    const p: Project = {
      id: "proj_" + Math.random().toString(36).slice(2, 10),
      name: name.replace(/\.[^.]+$/, "") || "Screenshot",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      activePage: 0,
      pages: [{ id: "pg_1", title: name, imageName: name, dataUrl, w, h, annotations: [] }],
    }
    try {
      await upsertProject(p)
    } catch {
      onToast(t("storageFull"), true)
      return
    }
    setProjects(await listProjects())
    onNew(p)
  }

  const onFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    const f = files[0]
    if (!f.type.startsWith("image/")) {
      onToast(t("chooseImageFile"), true)
      return
    }
    readImageFile(f, (dataUrl, w, h, name) => create(dataUrl, name, w, h))
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile()
          if (f) {
            readImageFile(f, (d, w, h, n) => create(d, n || "pasted", w, h))
            return
          }
        }
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ height: "100vh", background: th.bg, fontFamily: "Inter, -apple-system, sans-serif", color: th.text, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", background: th.surface, borderBottom: `1px solid ${th.border}` }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: th.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{I.export}</div>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{t("appName")}</span>
        <span style={{ fontSize: 12, color: th.textMuted, marginLeft: 4 }}>{t("tagline")}</span>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <HomeSidebar th={th} t={t} />
        <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px", maxWidth: 900, width: "100%" }}>
        <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 800 }}>
          {t("welcomeBack", { name: "" })}
        </h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
          <FeatureCard th={th} icon={I.highlight} iconBg={th.accentSoft} iconColor={th.accent} title={t("featAnnotateTitle")} desc={t("featAnnotateDesc")} />
          <FeatureCard th={th} icon={I.blur} iconBg="#E8F5E9" iconColor="#16A34A" title={t("featBlurTitle")} desc={t("featBlurDesc")} />
          <FeatureCard th={th} icon={I.pages} iconBg="#FFF3E0" iconColor="#F97316" title={t("featPagesTitle")} desc={t("featPagesDesc")} />
          <FeatureCard th={th} icon={I.export} iconBg="#F3E8FF" iconColor="#8B5CF6" title={t("featExportTitle")} desc={t("featExportDesc")} />
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: drag ? `2px dashed ${th.accent}` : `2px dashed ${th.mode === "dark" ? th.border : "#C9C9C4"}`,
            borderRadius: 14,
            background: drag ? th.accentSoft : th.surface,
            padding: "20px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            transition: "all .15s",
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: th.accentSoft, color: th.accent, display: "flex", alignItems: "center", justifyContent: "center", transform: "scale(1.4)" }}>{I.upload}</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>{t("uploadTitle")}</div>
          <div style={{ fontSize: 12.5, color: th.textMuted, textAlign: "center", maxWidth: 340, lineHeight: 1.5 }}>
            {t("dropSub", { browse: t("browse") })}
          </div>
          <div style={{ fontSize: 11.5, color: th.textFaint, marginTop: 2 }}>{t("formats")}</div>
          <button
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
            style={{ marginTop: 10, padding: "9px 22px", borderRadius: 9, border: "none", background: th.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {t("browseFiles")}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = "" }} />

        {projects.length > 0 && (
          <section style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{t("recent")}</h2>
              <span style={{ fontSize: 12, color: th.textFaint }}>{t("screenshotsCount", { count: projects.length, plural: projects.length > 1 ? "s" : "" })}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 170px))", gap: 12 }}>
              {projects.map((p) => (
                <Card key={p.id} p={p} th={th} t={t} onOpen={() => onOpen(p)} onDelete={async () => { await deleteProject(p.id); setProjects(await listProjects()) }} />
              ))}
            </div>
          </section>
        )}

        <div style={{ marginTop: 34, fontSize: 12, color: th.textFaint, textAlign: "center" }}>
          {t("localOnly")}
        </div>
        </main>
      </div>
      {headerExtra && (
        <footer style={{ display: "flex", justifyContent: "center", padding: "12px 20px", background: th.surface, borderTop: `1px solid ${th.border}` }}>
          {headerExtra}
        </footer>
      )}
    </div>
  )
}

function Card({ p, th, t, onOpen, onDelete }: { p: Project; th: ReturnType<typeof useTheme>; t: (k: string, v?: any) => string; onOpen: () => void; onDelete: () => void }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      if (p.pages[0]?.dataUrl) setUrl(p.pages[0].dataUrl)
    }
    img.src = p.pages[0]?.dataUrl || ""
  }, [p])
  return (
    <div
      onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = th.shadow)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
      style={{ borderRadius: 12, overflow: "hidden", background: th.surface, border: `1px solid ${th.border}`, cursor: "pointer", transition: "box-shadow .15s" }}
    >
      <div style={{ aspectRatio: "16/10", background: th.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: th.textFaint, fontSize: 12 }}>{t("preview")}</span>}
      </div>
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
        <div style={{ fontSize: 11, color: th.textFaint }}>{new Date(p.updatedAt).toLocaleDateString()}</div>
        <button
          onClick={(e) => { e.stopPropagation(); quickDownload(p) }}
          title={t("downloadPng")}
          style={{ border: "none", background: "none", cursor: "pointer", color: th.textFaint, padding: 4 }}
        >
          {I.export}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title={t("deleteProject")}
          style={{ border: "none", background: "none", cursor: "pointer", color: th.textFaint, padding: 4 }}
        >
          {I.trash}
        </button>
      </div>
      {p.pages.length > 1 && <div style={{ padding: "0 12px 8px", fontSize: 11, color: th.textFaint }}>{p.pages.length} {t("pages")}</div>}
    </div>
  )
}
