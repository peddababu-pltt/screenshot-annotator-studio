import type { Tool } from "./engine"
import { I } from "./icons"
import { useTheme } from "./theme"
import { useT } from "./translations"

interface Props {
  hasSel: boolean
  locked: boolean
  tool: Tool
  onCrop: () => void
  onRotate: (deg: 90 | -90) => void
  onFlip: (axis: "x" | "y") => void
  onLock: () => void
  onDelete: () => void
}

export default function CanvasToolbar({ hasSel, locked, tool, onCrop, onRotate, onFlip, onLock, onDelete }: Props) {
  const th = useTheme()
  const { t } = useT()
  const btn = (active = false) => ({
    width: 32, height: 32, borderRadius: 7, border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? th.accentSoft : "transparent", color: active ? th.accent : th.text,
  })
  return (
    <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", alignItems: "center", gap: 2, padding: "4px 6px", background: th.surface, borderRadius: 10, border: `1px solid ${th.border}`, boxShadow: th.shadow }}>
      <button title={t("crop")} style={btn(tool === "crop")} onClick={onCrop}>{I.crop}</button>
      <div style={{ width: 1, height: 20, background: th.border, margin: "0 4px" }} />
      <button title={t("rotateLeft")} disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4 }} onClick={() => onRotate(-90)}>{I.undo}</button>
      <button title={t("rotateRight")} disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4 }} onClick={() => onRotate(90)}>{I.redo}</button>
      <button title={t("flipH")} disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4 }} onClick={() => onFlip("x")}>{I.link}</button>
      <button title={t("flipV")} disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4, transform: "rotate(90deg)" }} onClick={() => onFlip("y")}>{I.link}</button>
      <div style={{ width: 1, height: 20, background: th.border, margin: "0 4px" }} />
      <button title={locked ? t("unlock") : t("lock")} disabled={!hasSel} style={{ ...btn(locked), opacity: hasSel ? 1 : 0.4 }} onClick={onLock}>{I.link}</button>
      <button title={t("delete")} disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4, color: "#DC2626" }} onClick={onDelete}>{I.trash}</button>
    </div>
  )
}
