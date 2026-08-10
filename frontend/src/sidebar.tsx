import { useRef } from "react"
import type { Project } from "./types"
import { LayersPanel } from "./panels"
import { I } from "./icons"
import { readImageFile } from "./files"
import { useTheme } from "./theme"
import { useT } from "./translations"

interface Props {
  proj: Project
  onSwitch: (i: number) => void
  onAdd: (dataUrl: string, name: string, w: number, h: number) => void
  onRemove: (i: number) => void
  onDeleteProject: () => void
  sel: string[]
  onSel: (id: string, mult?: boolean) => void
  onLayers: (id: string, action: string) => void
  onDup: (id: string) => void
}

export default function PagesLayersColumn({ proj, onSwitch, onAdd, onRemove, onDeleteProject, sel, onSel, onLayers, onDup }: Props) {
  const th = useTheme()
  const { t } = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const page = proj.pages[proj.activePage]

  const onFile = (f: File | undefined) => {
    if (!f) return
    readImageFile(f, (dataUrl, w, h, name) => onAdd(dataUrl, name, w, h))
  }

  return (
    <aside style={{ width: "100%", height: "100%", background: th.surface, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${th.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: th.textFaint, textTransform: "uppercase", letterSpacing: ".5px" }}>{t("pagesLabel")}</span>
        <button onClick={() => fileRef.current?.click()} title={t("addPage")} style={{ border: "none", background: "none", cursor: "pointer", color: th.accent }}>{I.plus}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />
      </div>
      <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 6 }}>
        {proj.pages.map((pg, i) => (
          <div key={pg.id} onClick={() => onSwitch(i)}
            style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", padding: 6, borderRadius: 8, cursor: "pointer", background: i === proj.activePage ? th.accentSoft : "transparent", border: "1px solid " + (i === proj.activePage ? th.accentBorder : "transparent") }}>
            <div style={{ position: "relative", width: 40, height: 26, borderRadius: 4, overflow: "visible", flexShrink: 0 }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 4, overflow: "hidden", background: th.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={pg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); if (proj.pages.length > 1) onRemove(i); else onDeleteProject() }}
                title={proj.pages.length > 1 ? t("removePage") : t("deleteProject")}
                style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", border: `1px solid ${th.border}`, background: th.surface, color: th.textFaint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 1px 3px rgba(0,0,0,.15)" }}
              >
                <span style={{ transform: "scale(0.6)", display: "flex" }}>{I.close}</span>
              </button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {pg.title}</div>
              <div style={{ fontSize: 10.5, color: th.textFaint }}>{pg.w} × {pg.h}</div>
            </div>
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 8, border: `1px dashed ${th.mode === "dark" ? th.border : "#C9C9C4"}`, background: th.surface, color: th.textMuted, fontSize: 12, cursor: "pointer" }}>
          {I.plus} {t("addPage")}
        </button>
      </div>
      <div style={{ borderTop: `1px solid ${th.border}`, flex: 1, minHeight: 0, overflowY: "auto" }}>
        <LayersPanel page={page} sel={sel} onSel={onSel} onLayers={onLayers} onDup={onDup} />
      </div>
    </aside>
  )
}
