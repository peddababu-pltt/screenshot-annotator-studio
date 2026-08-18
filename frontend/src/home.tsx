"use client"

import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Project } from "./types"
import { listProjects, deleteProject, upsertProject } from "./persist"
import { I } from "./icons"
import { readImageFile } from "./files"
import { drawAnn, preloadAnnImages } from "./draw"
import { useTheme, type Theme } from "./theme"
import { useT } from "./translations"

type NavView = "home" | "screenshots" | "projects"

async function quickDownload(p: Project) {
  const pg = p.pages[0]
  if (!pg) return
  const cv = document.createElement("canvas")
  cv.width = pg.w; cv.height = pg.h
  const ctx = cv.getContext("2d")!
  await preloadAnnImages(pg.annotations)
  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, pg.w, pg.h)
    for (const a of pg.annotations) if (a.visible !== false) drawAnn(ctx, a)
    const el = document.createElement("a")
    el.href = cv.toDataURL("image/png")
    el.download = `${p.name}.png`
    document.body.appendChild(el); el.click(); document.body.removeChild(el)
  }
  img.src = pg.dataUrl
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  if (m < 1) return "Just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatBytes(n: number): string {
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB"
  return (n / 1048576).toFixed(1) + " MB"
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ th, nav, setNav }: { th: Theme; nav: NavView; setNav: (v: NavView) => void }) {
  const { t } = useT()

  const navItems: { key: NavView; icon: any; label: string }[] = [
    { key: "home", icon: I.home, label: t("home") },
    { key: "screenshots", icon: I.pages, label: t("myScreenshots") },
    { key: "projects", icon: I.grid, label: t("projectsLabel") },
  ]

  return (
    <aside style={{
      width: 232, minWidth: 232, height: "100%", background: th.surface,
      borderRight: `1px solid ${th.border}`, display: "flex", flexDirection: "column",
      overflowY: "auto", boxSizing: "border-box",
    }}>
      <div style={{ padding: "12px 10px 4px", display: "flex", flexDirection: "column", gap: 6 }}>
        {navItems.map((item) => {
          const active = item.key === nav
          return (
            <button key={item.key} onClick={() => setNav(item.key)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              background: active ? th.accentSoft : "transparent",
              color: active ? th.accent : th.text,
              fontWeight: active ? 700 : 500, fontSize: 15, textAlign: "left",
            }}>
              <span style={{ color: active ? th.accent : th.textMuted, display: "flex" }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </div>

      <div style={{ height: 1, background: th.border, margin: "4px 0" }} />

      <div style={{ flex: 1 }} />

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${th.border}` }}>
        <div style={{ fontSize: 10.5, color: th.textFaint }}>
          © 2025 Screenshot Annotator v1.0.0
        </div>
      </div>
    </aside>
  )
}

// ── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ th, icon, iconBg, iconColor, title, desc }: { th: Theme; icon: any; iconBg: string; iconColor: string; title: string; desc: string }) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 180, padding: "18px 16px 16px", borderRadius: 14, background: th.surface, border: `1px solid ${th.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: th.textMuted, lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

// ── Row item shared ───────────────────────────────────────────────────────────

function ProjectRowItem({ p, th, t, onOpen, onDelete, showAnnotations }: {
  p: Project; th: Theme; t: (k: string, v?: any) => string;
  onOpen: () => void; onDelete: () => void; showAnnotations?: boolean
}) {
  const pg = p.pages[0]
  const ext = (pg?.imageName || "").split(".").pop()?.toUpperCase() || "PNG"
  const approxBytes = pg ? Math.round((pg.dataUrl?.length || 0) * 0.75) : 0
  const totalAnns = p.pages.reduce((s, x) => s + x.annotations.length, 0)

  return (
    <div onClick={onOpen}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, background: th.surface, border: `1px solid ${th.border}`, cursor: "pointer", transition: "box-shadow .15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = th.shadow)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ width: 80, height: 50, borderRadius: 8, overflow: "hidden", background: th.surfaceAlt, flexShrink: 0 }}>
        {pg?.dataUrl && <img src={pg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg?.title || p.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 5, background: th.accentSoft, color: th.accent }}>{ext}</span>
        </div>
        <div style={{ fontSize: 11.5, color: th.textMuted }}>
          {pg ? `${pg.w} × ${pg.h} px` : ""}
          {approxBytes > 0 ? ` · ${formatBytes(approxBytes)}` : ""}
          {p.pages.length > 1 ? ` · ${p.pages.length} ${t("pages")}` : ""}
        </div>
        <div style={{ fontSize: 11, color: th.textFaint, marginTop: 2 }}>
          {showAnnotations && totalAnns > 0 ? `${totalAnns} ${t("annotationToolsLabel").toLowerCase()} · ` : ""}
          {timeAgo(p.updatedAt)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => quickDownload(p)} title={t("downloadPng")}
          style={{ width: 32, height: 32, border: `1px solid ${th.border}`, borderRadius: 8, background: "none", cursor: "pointer", color: th.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I.export}
        </button>
        <button onClick={onOpen} title={t("annotateBtn")}
          style={{ width: 32, height: 32, border: `1px solid ${th.border}`, borderRadius: 8, background: "none", cursor: "pointer", color: th.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I.pen}
        </button>
        <button onClick={onDelete} title={t("deleteProject")}
          style={{ width: 32, height: 32, border: `1px solid ${th.border}`, borderRadius: 8, background: "none", cursor: "pointer", color: th.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I.trash}
        </button>
      </div>
    </div>
  )
}

// ── My Screenshots view ───────────────────────────────────────────────────────

function ScreenshotsView({ projects, th, t, onOpen, onDelete, onAdd }: {
  projects: Project[]; th: Theme; t: (k: string, v?: any) => string;
  onOpen: (p: Project) => void; onDelete: (p: Project) => void; onAdd: () => void
}) {
  if (projects.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: th.textMuted, paddingTop: 80 }}>
        <div style={{ fontSize: 36 }}>🖼️</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t("noScreenshotsYet")}</div>
        <div style={{ fontSize: 13, color: th.textFaint }}>{t("uploadToGetStarted")}</div>
        <button onClick={onAdd} style={{ marginTop: 8, padding: "9px 22px", borderRadius: 10, border: "none", background: th.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {t("uploadScreenshotBtn")}
        </button>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t("myScreenshots")}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: th.textMuted }}>
            {projects.length} {t("screenshotsCount", { count: "", plural: "" }).trim()} — {t("originalInputImages")}
          </p>
        </div>
        <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9, border: "none", background: th.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {I.plus} {t("uploadScreenshotBtn")}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {projects.map((p) => {
          const pg = p.pages[0]
          return (
            <div key={p.id} onClick={() => onOpen(p)}
              style={{ borderRadius: 12, overflow: "hidden", background: th.surface, border: `1px solid ${th.border}`, cursor: "pointer", transition: "box-shadow .15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = th.shadow)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ aspectRatio: "16/10", background: th.surfaceAlt, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {pg?.dataUrl
                  ? <img src={pg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ color: th.textFaint, fontSize: 12 }}>{t("preview")}</span>}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg?.title || p.name}</div>
                <div style={{ fontSize: 11, color: th.textMuted, marginTop: 2 }}>
                  {pg ? `${pg.w} × ${pg.h}` : ""} · {timeAgo(p.createdAt)}
                </div>
              </div>
              <div style={{ padding: "0 12px 10px", display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onOpen(p)}
                  style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${th.border}`, background: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: th.accent }}>
                  {t("annotateBtn")}
                </button>
                <button onClick={() => onDelete(p)}
                  style={{ width: 30, borderRadius: 7, border: `1px solid ${th.border}`, background: "none", cursor: "pointer", color: th.textFaint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {I.trash}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Projects view ─────────────────────────────────────────────────────────────

function ProjectsView({ projects, th, t, onOpen, onDelete }: {
  projects: Project[]; th: Theme; t: (k: string, v?: any) => string;
  onOpen: (p: Project) => void; onDelete: (p: Project) => void;
}) {
  const annotated = projects.filter((p) => p.pages.some((pg) => pg.annotations.length > 0))

  if (annotated.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: th.textMuted, paddingTop: 80 }}>
        <div style={{ fontSize: 36 }}>✏️</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t("noAnnotatedProjects")}</div>
        <div style={{ fontSize: 13, color: th.textFaint }}>{t("annotateToSeeHere")}</div>
      </div>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t("projectsLabel")}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: th.textMuted }}>
          {annotated.length} {t("projectsLabel").toLowerCase()}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {annotated.map((p) => (
          <ProjectRowItem key={p.id} p={p} th={th} t={t} showAnnotations
            onOpen={() => onOpen(p)}
            onDelete={() => onDelete(p)}
          />
        ))}
      </div>
    </>
  )
}

// ── Home view ─────────────────────────────────────────────────────────────────

function HomeView({ th, t, projects, drag, setDrag, fileRef, onOpen, onDelete }: {
  th: Theme; t: (k: string, v?: any) => string; projects: Project[];
  drag: boolean; setDrag: (b: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  onOpen: (p: Project) => void; onDelete: (p: Project) => void;
}) {
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800 }}>{t("welcomeBack", { name: " 👋" })}</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13.5, color: th.textMuted }}>{t("tagline")}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <FeatureCard th={th} icon={I.select} iconBg={th.accentSoft} iconColor={th.accent}
          title={t("featAnnotateTitle")} desc={t("featAnnotateDesc")} />
        <FeatureCard th={th} icon={I.blur} iconBg="#DCFCE7" iconColor="#16A34A"
          title={t("featBlurTitle")} desc={t("featBlurDesc")} />
        <FeatureCard th={th} icon={I.pages} iconBg="#DBEAFE" iconColor="#2563EB"
          title={t("featPagesTitle")} desc={t("featPagesDesc")} />
        <FeatureCard th={th} icon={I.export} iconBg="#FEF3C7" iconColor="#D97706"
          title={t("featExportTitle")} desc={t("featExportDesc")} />
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); fileRef.current?.click() }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? th.accent : th.accentBorder}`,
          borderRadius: 16, background: drag ? th.accentSoft : th.surface,
          padding: "32px 24px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 6, cursor: "pointer", transition: "all .15s", marginBottom: 28,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 14, background: th.accentSoft, color: th.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I.upload}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{t("uploadOrPasteTitle")}</div>
        <div style={{ fontSize: 12.5, color: th.textMuted, textAlign: "center" }}>{t("dragDropBrowse")}</div>
        <div style={{ fontSize: 11.5, color: th.textFaint }}>{t("formats")}</div>
        <button
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
          style={{ marginTop: 8, padding: "9px 24px", borderRadius: 10, border: "none", background: th.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}
        >
          {I.pages} {t("browseFiles")}
        </button>
        <div style={{ fontSize: 11.5, color: th.textFaint }}>
          {t("orPasteImageWith")} {isMac ? "⌘" : "Ctrl"} + V
        </div>
      </div>

      {projects.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t("recentScreenshots")}</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.slice(0, 5).map((p) => (
              <ProjectRowItem key={p.id} p={p} th={th} t={t}
                onOpen={() => onOpen(p)}
                onDelete={() => onDelete(p)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

interface Props {
  projects: Project[]
  onNew: (p: Project) => void
  onOpen: (p: Project) => void
  onToast: (m: string, e?: boolean) => void
  headerExtra?: ReactNode
  backend?: "checking" | "ok" | "offline"
}

export default function Home({ projects: ext, onNew, onOpen, onToast, headerExtra, backend = "checking" }: Props) {
  const [projects, setProjects] = useState<Project[]>(ext)
  const [nav, setNav] = useState<NavView>("home")
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const th = useTheme()
  const { t } = useT()

  useEffect(() => { setProjects(ext) }, [ext])

  const create = async (dataUrl: string, name: string, w: number, h: number) => {
    const p: Project = {
      id: "proj_" + Math.random().toString(36).slice(2, 10),
      name: name.replace(/\.[^.]+$/, "") || "Screenshot",
      createdAt: Date.now(), updatedAt: Date.now(), activePage: 0,
      pages: [{ id: "pg_1", title: name, imageName: name, dataUrl, w, h, annotations: [] }],
    }
    try { await upsertProject(p) } catch { onToast(t("storageFull"), true); return }
    setProjects(await listProjects())
    onNew(p)
  }

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    const f = files[0]
    if (!f.type.startsWith("image/")) { onToast(t("chooseImageFile"), true); return }
    readImageFile(f, (dataUrl, w, h, name) => create(dataUrl, name, w, h))
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile()
          if (f) { readImageFile(f, (d, w, h, n) => create(d, n || "pasted", w, h)); return }
        }
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  const handleDelete = async (p: Project) => {
    await deleteProject(p.id)
    setProjects(await listProjects())
  }

  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

  return (
    <div style={{ height: "100vh", background: th.bg, fontFamily: "Inter, -apple-system, sans-serif", color: th.text, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <header style={{ height: 54, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", background: th.surface, borderBottom: `3px solid ${th.accent}` }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: th.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{I.export}</div>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{t("appName")}</span>
        <span style={{ fontSize: 12, color: th.textMuted }}>{t("tagline")}</span>
        <div style={{ flex: 1 }} />
      </header>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Sidebar th={th} nav={nav} setNav={setNav} />
        <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "28px 32px" }}>
          {nav === "home" && (
            <HomeView th={th} t={t} projects={projects} drag={drag} setDrag={setDrag} fileRef={fileRef} onOpen={onOpen} onDelete={handleDelete} />
          )}
          {nav === "screenshots" && (
            <ScreenshotsView projects={projects} th={th} t={t} onOpen={onOpen} onDelete={handleDelete} onAdd={() => fileRef.current?.click()} />
          )}
          {nav === "projects" && (
            <ProjectsView projects={projects} th={th} t={t} onOpen={onOpen} onDelete={handleDelete} />
          )}
        </main>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = "" }} />

      {/* Footer */}
      <footer style={{ height: 40, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 20px", background: th.surface, borderTop: `1px solid ${th.border}`, fontSize: 11.5, color: th.textFaint, gap: 16 }}>
        <div style={{ flex: 1 }} />
        <span>{isMac ? "⌘" : "Ctrl"} + V to paste image</span>
        <span style={{ color: th.border }}>·</span>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: backend === "ok" ? "#15803D" : th.textFaint }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: backend === "ok" ? "#22C55E" : backend === "offline" ? "#F59E0B" : "#CBD5E1", display: "inline-block" }} />
          {backend === "ok" ? t("backendOk") : backend === "offline" ? t("backendOffline") : t("backendChecking")}
        </div>
      </footer>
    </div>
  )
}
