"use client"

import { useEffect, useRef, useState } from "react"
import type { Project } from "./types"
import { listProjects, deleteProject, upsertProject } from "./persist"
import { I } from "./icons"
import { readImageFile } from "./files"
import { drawAnn, preloadAnnImages } from "./draw"
import { useTheme, type Theme, type ShellPalette } from "./theme"
import { useT } from "./translations"
import ShellTopBar from "./topbar"
import ShellBackdrop from "./backdrop"

type NavView = "home" | "screenshots" | "projects"

const NAV_COLLAPSED_KEY = "annotator_nav_collapsed"

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

function Sidebar({ th, nav, setNav, collapsed, onToggle }: {
  th: Theme; nav: NavView; setNav: (v: NavView) => void;
  collapsed: boolean; onToggle: () => void;
}) {
  const { t } = useT()
  const sh = th.shell
  const width = collapsed ? 68 : 264

  const navItems: { key: NavView; icon: any; label: string }[] = [
    { key: "home", icon: I.home, label: t("home") },
    { key: "screenshots", icon: I.pages, label: t("myScreenshots") },
    { key: "projects", icon: I.grid, label: t("projectsLabel") },
  ]

  return (
    <aside style={{
      position: "relative", width, minWidth: width, height: "100%",
      background: sh.navBg, display: "flex", flexDirection: "column",
      boxSizing: "border-box", overflow: "hidden", transition: "width .16s ease",
    }}>
      <div style={{ position: "absolute", inset: 0, background: sh.navGlow, pointerEvents: "none" }} />

      {/* Brand */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 11, padding: collapsed ? "20px 0" : "20px 16px 20px 20px", justifyContent: collapsed ? "center" : undefined }}>
        {!collapsed && (
          <>
            <span style={{ display: "flex", color: sh.navText, flexShrink: 0 }}>
              <span style={{ display: "flex", transform: "scale(1.35)" }}>{I.logoStack}</span>
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: sh.navText, letterSpacing: "-.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t("appName")}
            </span>
          </>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          aria-expanded={!collapsed}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", color: sh.navTextMuted, cursor: "pointer", flexShrink: 0, padding: 0 }}
        >
          <span style={{ display: "flex", transform: "scale(.8)" }}>{collapsed ? I.chevRR : I.chevLL}</span>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ position: "relative", padding: collapsed ? "4px 10px" : "4px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        {navItems.map((item) => {
          const active = item.key === nav
          return (
            <button key={item.key} onClick={() => setNav(item.key)} title={collapsed ? item.label : undefined} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 13,
              padding: collapsed ? "11px 0" : "11px 14px", borderRadius: 10, cursor: "pointer",
              textAlign: "left", justifyContent: collapsed ? "center" : undefined,
              background: active ? sh.navActiveBg : "transparent",
              border: `1px solid ${active ? sh.navActiveBorder : "transparent"}`,
              color: active ? sh.navText : sh.navTextMuted,
              fontWeight: active ? 600 : 500, fontSize: 14.5, fontFamily: "inherit",
            }}>
              <span style={{ display: "flex", flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && item.label}
            </button>
          )
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {!collapsed && (
        <div style={{ position: "relative", padding: "16px 20px", borderTop: `1px solid ${sh.navBorder}` }}>
          <div style={{ fontSize: 10.5, color: sh.navTextMuted }}>
            © 2025 Screenshot Annotator v1.0.0
          </div>
        </div>
      )}
    </aside>
  )
}

// ── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ sh, icon, title, desc }: { sh: ShellPalette; icon: any; title: string; desc: string }) {
  return (
    <div style={{
      position: "relative", flex: "1 1 180px", minWidth: 180, padding: "20px 18px 18px",
      borderRadius: 14, background: sh.surface, border: `1px solid ${sh.border}`,
      display: "flex", flexDirection: "column", gap: 9,
    }}>
      <div style={{
        position: "absolute", top: 16, right: 16, width: 26, height: 26, borderRadius: "50%",
        border: `1px solid ${sh.border}`, color: sh.textMuted,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ display: "flex", transform: "scale(.72)" }}>{I.chevR}</span>
      </div>
      <div style={{
        width: 44, height: 44, borderRadius: 13, background: sh.inkTile, color: sh.ink,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: sh.text }}>{title}</div>
      <div style={{ fontSize: 12.5, color: sh.textMuted, lineHeight: 1.55 }}>{desc}</div>
    </div>
  )
}

// ── Row item shared ───────────────────────────────────────────────────────────

function ProjectRowItem({ p, sh, t, onOpen, onDelete, showAnnotations }: {
  p: Project; sh: ShellPalette; t: (k: string, v?: any) => string;
  onOpen: () => void; onDelete: () => void; showAnnotations?: boolean
}) {
  const pg = p.pages[0]
  const ext = (pg?.imageName || "").split(".").pop()?.toUpperCase() || "PNG"
  const approxBytes = pg ? Math.round((pg.dataUrl?.length || 0) * 0.75) : 0
  const totalAnns = p.pages.reduce((s, x) => s + x.annotations.length, 0)

  return (
    <div onClick={onOpen}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, background: sh.surface, border: `1px solid ${sh.border}`, cursor: "pointer", transition: "box-shadow .15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = sh.shadow)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ width: 80, height: 50, borderRadius: 8, overflow: "hidden", background: sh.surfaceAlt, flexShrink: 0 }}>
        {pg?.dataUrl && <img src={pg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg?.title || p.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 5, background: sh.inkTile, color: sh.textMuted }}>{ext}</span>
        </div>
        <div style={{ fontSize: 11.5, color: sh.textMuted }}>
          {pg ? `${pg.w} × ${pg.h} px` : ""}
          {approxBytes > 0 ? ` · ${formatBytes(approxBytes)}` : ""}
          {p.pages.length > 1 ? ` · ${p.pages.length} ${t("pages")}` : ""}
        </div>
        <div style={{ fontSize: 11, color: sh.textFaint, marginTop: 2 }}>
          {showAnnotations && totalAnns > 0 ? `${totalAnns} ${t("annotationToolsLabel").toLowerCase()} · ` : ""}
          {timeAgo(p.updatedAt)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => quickDownload(p)} title={t("downloadPng")}
          style={{ width: 32, height: 32, border: `1px solid ${sh.border}`, borderRadius: 8, background: "none", cursor: "pointer", color: sh.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I.export}
        </button>
        <button onClick={onOpen} title={t("annotateBtn")}
          style={{ width: 32, height: 32, border: `1px solid ${sh.border}`, borderRadius: 8, background: "none", cursor: "pointer", color: sh.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I.pen}
        </button>
        <button onClick={onDelete} title={t("deleteProject")}
          style={{ width: 32, height: 32, border: `1px solid ${sh.border}`, borderRadius: 8, background: "none", cursor: "pointer", color: sh.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I.trash}
        </button>
      </div>
    </div>
  )
}

// ── My Screenshots view ───────────────────────────────────────────────────────

function ScreenshotsView({ projects, sh, t, onOpen, onDelete, onAdd }: {
  projects: Project[]; sh: ShellPalette; t: (k: string, v?: any) => string;
  onOpen: (p: Project) => void; onDelete: (p: Project) => void; onAdd: () => void
}) {
  if (projects.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: sh.textMuted, paddingTop: 80 }}>
        <div style={{ fontSize: 36 }}>🖼️</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t("noScreenshotsYet")}</div>
        <div style={{ fontSize: 13, color: sh.textFaint }}>{t("uploadToGetStarted")}</div>
        <button onClick={onAdd} style={{ marginTop: 8, padding: "10px 24px", borderRadius: 999, border: "none", background: sh.btn, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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
          <p style={{ margin: "4px 0 0", fontSize: 13, color: sh.textMuted }}>
            {projects.length} {t("screenshotsCount", { count: "", plural: "" }).trim()} — {t("originalInputImages")}
          </p>
        </div>
        <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 999, border: "none", background: sh.btn, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {I.plus} {t("uploadScreenshotBtn")}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {projects.map((p) => {
          const pg = p.pages[0]
          return (
            <div key={p.id} onClick={() => onOpen(p)}
              style={{ borderRadius: 12, overflow: "hidden", background: sh.surface, border: `1px solid ${sh.border}`, cursor: "pointer", transition: "box-shadow .15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = sh.shadow)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ aspectRatio: "16/10", background: sh.surfaceAlt, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {pg?.dataUrl
                  ? <img src={pg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ color: sh.textFaint, fontSize: 12 }}>{t("preview")}</span>}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg?.title || p.name}</div>
                <div style={{ fontSize: 11, color: sh.textMuted, marginTop: 2 }}>
                  {pg ? `${pg.w} × ${pg.h}` : ""} · {timeAgo(p.createdAt)}
                </div>
              </div>
              <div style={{ padding: "0 12px 10px", display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onOpen(p)}
                  style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${sh.border}`, background: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: sh.text, fontFamily: "inherit" }}>
                  {t("annotateBtn")}
                </button>
                <button onClick={() => onDelete(p)}
                  style={{ width: 30, borderRadius: 8, border: `1px solid ${sh.border}`, background: "none", cursor: "pointer", color: sh.textFaint, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

function ProjectsView({ projects, sh, t, onOpen, onDelete }: {
  projects: Project[]; sh: ShellPalette; t: (k: string, v?: any) => string;
  onOpen: (p: Project) => void; onDelete: (p: Project) => void;
}) {
  const annotated = projects.filter((p) => p.pages.some((pg) => pg.annotations.length > 0))

  if (annotated.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: sh.textMuted, paddingTop: 80 }}>
        <div style={{ fontSize: 36 }}>✏️</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t("noAnnotatedProjects")}</div>
        <div style={{ fontSize: 13, color: sh.textFaint }}>{t("annotateToSeeHere")}</div>
      </div>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t("projectsLabel")}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: sh.textMuted }}>
          {annotated.length} {t("projectsLabel").toLowerCase()}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {annotated.map((p) => (
          <ProjectRowItem key={p.id} p={p} sh={sh} t={t} showAnnotations
            onOpen={() => onOpen(p)}
            onDelete={() => onDelete(p)}
          />
        ))}
      </div>
    </>
  )
}

// ── Home view ─────────────────────────────────────────────────────────────────

function HomeView({ sh, t, projects, drag, setDrag, fileRef, onOpen, onDelete }: {
  sh: ShellPalette; t: (k: string, v?: any) => string; projects: Project[];
  drag: boolean; setDrag: (b: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  onOpen: (p: Project) => void; onDelete: (p: Project) => void;
}) {
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

  return (
    <>
      {/* Welcome, with a rule down its left edge */}
      <div style={{ display: "flex", gap: 18, marginBottom: 26 }}>
        <span style={{ width: 2, borderRadius: 2, background: sh.rule, flexShrink: 0, alignSelf: "stretch" }} />
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 27, fontWeight: 800, letterSpacing: "-.4px" }}>{t("welcomeBack", { name: " 👋" })}</h1>
          <p style={{ margin: 0, fontSize: 14, color: sh.textMuted }}>{t("tagline")}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 24 }}>
        <FeatureCard sh={sh} icon={I.select} title={t("featAnnotateTitle")} desc={t("featAnnotateDesc")} />
        <FeatureCard sh={sh} icon={I.blur} title={t("featBlurTitle")} desc={t("featBlurDesc")} />
        <FeatureCard sh={sh} icon={I.pages} title={t("featPagesTitle")} desc={t("featPagesDesc")} />
        <FeatureCard sh={sh} icon={I.export} title={t("featExportTitle")} desc={t("featExportDesc")} />
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); fileRef.current?.click() }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? sh.rule : sh.borderDashed}`,
          borderRadius: 16, background: drag ? sh.surfaceAlt : "transparent",
          padding: "44px 24px 38px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 6, cursor: "pointer", transition: "all .15s", marginBottom: 28,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: sh.surface, border: `1px solid ${sh.border}`, color: sh.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ display: "flex", transform: "scale(1.15)" }}>{I.upload}</span>
          </div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.3px" }}>{t("uploadOrPasteTitle")}</div>
        <div style={{ fontSize: 13, color: sh.textMuted, textAlign: "center" }}>{t("dragDropBrowse")}</div>
        <div style={{ fontSize: 12.5, color: sh.textFaint }}>{t("formats")}</div>
        <button
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
          onMouseEnter={(e) => (e.currentTarget.style.background = sh.btnHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = sh.btn)}
          style={{ marginTop: 14, padding: "11px 26px", borderRadius: 999, border: "none", background: sh.btn, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontFamily: "inherit", boxShadow: "0 6px 18px rgba(20,25,32,.18)" }}
        >
          {I.folder} {t("browseFiles")}
        </button>
        <div style={{ fontSize: 12.5, color: sh.textFaint, marginTop: 10 }}>
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
              <ProjectRowItem key={p.id} p={p} sh={sh} t={t}
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
  backend?: "checking" | "ok" | "offline"
}

export default function Home({ projects: ext, onNew, onOpen, onToast, backend = "checking" }: Props) {
  const [projects, setProjects] = useState<Project[]>(ext)
  const [nav, setNav] = useState<NavView>("home")
  const [railCollapsed, setRailCollapsed] = useState(() => sessionStorage.getItem(NAV_COLLAPSED_KEY) === "1")
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const th = useTheme()
  const sh = th.shell
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
    <div style={{ height: "100vh", background: sh.pageBg, fontFamily: "Inter, -apple-system, sans-serif", color: sh.text, display: "flex", overflow: "hidden" }}>
      <Sidebar
        th={th}
        nav={nav}
        setNav={setNav}
        collapsed={railCollapsed}
        onToggle={() => setRailCollapsed((c) => { sessionStorage.setItem(NAV_COLLAPSED_KEY, c ? "0" : "1"); return !c })}
      />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <ShellTopBar />

        <main style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", padding: "30px 34px" }}>
          <ShellBackdrop sh={sh} />
          <div style={{ position: "relative", zIndex: 1 }}>
            {nav === "home" && (
              <HomeView sh={sh} t={t} projects={projects} drag={drag} setDrag={setDrag} fileRef={fileRef} onOpen={onOpen} onDelete={handleDelete} />
            )}
            {nav === "screenshots" && (
              <ScreenshotsView projects={projects} sh={sh} t={t} onOpen={onOpen} onDelete={handleDelete} onAdd={() => fileRef.current?.click()} />
            )}
            {nav === "projects" && (
              <ProjectsView projects={projects} sh={sh} t={t} onOpen={onOpen} onDelete={handleDelete} />
            )}
          </div>
        </main>

        <footer style={{ height: 44, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 34px", borderTop: `1px solid ${sh.border}`, fontSize: 12, color: sh.textFaint, gap: 16 }}>
          <div style={{ flex: 1 }} />
          <span>{isMac ? "⌘" : "Ctrl"} + V to paste image</span>
          <span style={{ color: sh.border }}>·</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: backend === "ok" ? sh.textMuted : sh.textFaint }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: backend === "ok" ? "#22C55E" : backend === "offline" ? "#F59E0B" : "#CBD5E1", display: "inline-block" }} />
            {backend === "ok" ? t("backendOk") : backend === "offline" ? t("backendOffline") : t("backendChecking")}
          </div>
        </footer>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = "" }} />
    </div>
  )
}
