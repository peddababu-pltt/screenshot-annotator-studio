import type { Ann, BoxAnn, CalloutAnn, ImageAnn, LineAnn, NumberAnn, PenAnn, TextAnn, Page } from "./types"
import { typeName } from "./tools"
import { I } from "./icons"
import { useTheme, type Theme } from "./theme"
import { useT } from "./translations"

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function Field({ label, value, onChange, min, max, step = 1 }) {
  const th = useTheme()
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: th.textMuted, textTransform: "uppercase", letterSpacing: ".4px" }}>{label}</span>
      <input
        type="number"
        value={Math.round((Number(value) || 0) * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0, min ?? -99999, max ?? 99999))}
        style={{ border: `1px solid ${th.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 12, width: "100%", color: th.text, background: th.surface, boxSizing: "border-box" }}
      />
    </label>
  )
}

export function ColorRow({ label, value, onChange }) {
  const th = useTheme()
  const colors = ["#EF4444", "#F97316", "#FACC15", "#22C55E", "#3B82F6", "#A855F7", "#7C2D3B", "#FFFFFF"]
  const hex = typeof value === "string" && value.startsWith("#") ? value : "#111111"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }}>
      <span style={{ fontSize: 10, color: th.textMuted, textTransform: "uppercase", letterSpacing: ".4px" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} style={{ width: 30, height: 26, border: `1px solid ${th.border}`, borderRadius: 6, padding: 1, background: th.surface, cursor: "pointer" }} />
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {colors.map((c, i) => {
            const active = hex.toLowerCase() === c.toLowerCase()
            return (
              <button key={i} onClick={() => onChange(c)} title={c}
                style={{ width: 15, height: 15, borderRadius: 4, background: c, border: c === "#FFFFFF" ? `1px solid ${th.border}` : "none", cursor: "pointer", outline: active ? `2px solid ${th.accent}` : "none", outlineOffset: 0, padding: 0 }} />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function SliderRow({ label, value, onChange, min, max, step = 1 }) {
  const th = useTheme()
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: th.textMuted }}>
        <span>{label}</span>
        <span style={{ color: th.text, fontWeight: 600 }}>{value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: th.accent }} />
    </label>
  )
}

export function Group({ title, children }) {
  const th = useTheme()
  return (
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${th.border}` }}>
      {title && <div style={{ fontSize: 10, fontWeight: 600, color: th.textFaint, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>{title}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{children}</div>
    </div>
  )
}

const FieldRow = ({ children }) => <div style={{ display: "flex", gap: 8, width: "100%" }}>{children}</div>
const Row = FieldRow

function SegAlign({ value, onChange }) {
  const th = useTheme()
  const opts = [
    { v: "left", ch: "⬅" },
    { v: "center", ch: "≡" },
    { v: "right", ch: "➡" },
  ]
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opts.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} title={o.v}
          style={{ padding: "4px 10px", borderRadius: 6, border: value === o.v ? `1px solid ${th.accent}` : `1px solid ${th.border}`, background: value === o.v ? th.accentSoft : th.surface, fontSize: 11, color: th.text, cursor: "pointer" }}>
          {o.ch}
        </button>
      ))}
    </div>
  )
}

export function TextAreaInput({ value, onChange }) {
  const th = useTheme()
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type…"
      style={{ width: "100%", minHeight: 56, border: `1px solid ${th.border}`, borderRadius: 6, padding: 7, fontSize: 13, resize: "vertical", boxSizing: "border-box", background: th.surface, color: th.text }}
    />
  )
}

// ---------------------------------------------------------------- panels

interface P {
  page: Page | null
  sel: string[]
  ann: Ann | null
  sw: number
  color: string
  zoom: number
  tab: "style" | "arrange"
  setTab: (t: "style" | "arrange") => void
  onPatch: (patch: Partial<Ann>) => void
  onColor: (c: string) => void
  onSw: (n: number) => void
  onZoom: (n: number) => void
  onFit: () => void
  onLayers: (id: string, action: string) => void
  onSel: (id: string, mult?: boolean) => void
  onDup: (id: string) => void
}

export default function RightPanel(p: P) {
  const th = useTheme()
  const { t } = useT()
  return (
    <aside style={{ width: "100%", height: "100%", background: th.surface, display: "flex", flexDirection: "column", overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${th.border}` }}>
        {(["style", "arrange"] as const).map((tb) => (
          <button key={tb} onClick={() => p.setTab(tb)}
            style={{ flex: 1, padding: "11px 0", fontSize: 12, fontWeight: 600, border: "none", background: "none", cursor: "pointer", color: p.tab === tb ? th.text : th.textFaint, borderBottom: p.tab === tb ? `2px solid ${th.accent}` : "2px solid transparent", textTransform: "capitalize" }}>
            {tb === "style" ? t("style") : t("arrange")}
          </button>
        ))}
      </div>
      <PropsPanel
        page={p.page} ann={p.ann} selCount={p.sel.length} sw={p.sw} color={p.color} zoom={p.zoom}
        tab={p.tab} onZoom={p.onZoom} onFit={p.onFit} onColor={p.onColor} onSw={p.onSw} onPatch={p.onPatch}
        onDup={p.onDup} onLayers={p.onLayers} sel={p.sel}
      />
    </aside>
  )
}

export function LayersPanel({ page, sel, onSel, onLayers, onDup }) {
  const th = useTheme()
  const { t } = useT()
  const anns = page?.annotations || []
  return (
    <div style={{ padding: "10px 8px" }}>
      <Group title={t("layers")}>
        {anns.length === 0 && <div style={{ fontSize: 12, color: th.textFaint, padding: "6px 0" }}>{t("noAnnotations")}</div>}
        {[...anns].reverse().map((a) => {
          const isSel = sel.includes(a.id)
          const name = a.name || typeName(a.type)
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 2, padding: "3px 4px", marginBottom: 2, borderRadius: 6, background: isSel ? th.accentSoft : "transparent", border: "1px solid " + (isSel ? th.accentBorder : "transparent") }}>
              <button onClick={() => onLayers(a.id, "toggle")} title={a.visible ? t("hide") : t("show")}
                style={{ ...AlBtn(th), color: a.visible ? th.text : th.textFaint }}>{a.visible ? I.eye : I.close}</button>
              <div onClick={() => onSel(a.id)} style={{ flex: 1, fontSize: 12, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSel ? th.text : th.textMuted, padding: "2px 0" }}
                title={name}>{name}</div>
              <button onClick={() => onLayers(a.id, "up")} title={t("bringToFront")} style={AlBtn(th)}>{I.chevR}</button>
              <button onClick={() => onLayers(a.id, "down")} title={t("sendToBack")} style={AlBtn(th)}>{I.chevD}</button>
              <button onClick={() => onDup(a.id)} title={t("duplicate")} style={AlBtn(th)}>{I.copy}</button>
              <button onClick={() => onLayers(a.id, "delete")} title={t("delete")} style={AlBtn(th)}>{I.trash}</button>
            </div>
          )
        })}
      </Group>
    </div>
  )
}

const AlBtn = (th: Theme) => ({ border: "none", background: "none", cursor: "pointer", padding: "2px 5px", color: th.textMuted, fontSize: 11 })

function PropsPanel({ page, ann, selCount, sw, color, zoom, tab, onZoom, onFit, onColor, onSw, onPatch, onDup, onLayers, sel }) {
  const th = useTheme()
  const { t } = useT()
  if (!ann) {
    if (tab === "arrange") {
      return <Group title={t("zoom")}><SliderRow label={t("zoom")} value={Math.round(zoom * 100)} min={10} max={400} onChange={(n) => onZoom(n / 100)} /></Group>
    }
    return (
      <div>
        <Group title={t("canvas")}>
          <div style={{ fontSize: 12, color: th.textMuted, display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
            {page && <div>{t("imageSize")}: <b>{page.w} × {page.h}</b> px</div>}
            {selCount === 0 && <button onClick={onFit} style={GhostBtn(th)}>{t("fitToScreen")}</button>}
          </div>
        </Group>
        <Group title={selCount > 1 ? t("objectsSelected", { count: selCount }) : t("toolStyle")}>
          {selCount <= 1 && (<>
            <ColorRow label={t("defaultColor")} value={color} onChange={onColor} />
            <SliderRow label={t("strokeWidth")} value={sw} min={1} max={24} onChange={onSw} />
          </>)}
          {selCount > 1 && <div style={{ fontSize: 12, color: th.textMuted }}>{t("moveOrDelete")}</div>}
        </Group>
      </div>
    )
  }
  if (selCount > 1) {
    return <Group title={t("objectsSelected", { count: selCount })}><div style={{ fontSize: 12, color: th.textMuted }}>{t("selectedInspect")}</div></Group>
  }
  return (
    <>
      <ObjectProps ann={ann} onPatch={onPatch} tab={tab} />
      <ActionsRow id={ann.id} locked={!!ann.locked} visible={ann.visible !== false} onDup={onDup} onLayers={onLayers} />
    </>
  )
}

function ActionsRow({ id, locked, visible, onDup, onLayers }: { id: string; locked: boolean; visible: boolean; onDup: (id: string) => void; onLayers: (id: string, action: string) => void }) {
  const th = useTheme()
  const { t } = useT()
  const btn = { border: `1px solid ${th.border}`, background: th.surface, borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: th.text }
  return (
    <Group title={t("actions")}>
      <div style={{ display: "flex", gap: 6 }}>
        <button title={t("duplicate")} style={btn} onClick={() => onDup(id)}>{I.copy}</button>
        <button title={locked ? t("unlock") : t("lock")} style={{ ...btn, color: locked ? th.accent : th.text }} onClick={() => onLayers(id, "lock")}>{I.link}</button>
        <button title={visible ? t("hide") : t("show")} style={btn} onClick={() => onLayers(id, "toggle")}>{visible ? I.eye : I.close}</button>
        <button title={t("bringToFront")} style={btn} onClick={() => onLayers(id, "front")}>{I.chevR}</button>
        <button title={t("sendToBack")} style={btn} onClick={() => onLayers(id, "back")}>{I.chevD}</button>
        <button title={t("delete")} style={{ ...btn, color: "#DC2626" }} onClick={() => onLayers(id, "delete")}>{I.trash}</button>
      </div>
    </Group>
  )
}

function ObjectProps({ ann, onPatch, tab }) {
  switch (ann.type) {
    case "rect": case "rrect": case "ellipse": return <BoxP an={ann} onPatch={onPatch} tab={tab} />
    case "image": return <ImgP an={ann} onPatch={onPatch} tab={tab} />
    case "highlight": return <HiP an={ann} onPatch={onPatch} tab={tab} />
    case "blur": case "pixelate": return <FXP an={ann} onPatch={onPatch} tab={tab} />
    case "callout": return <CallP an={ann} onPatch={onPatch} tab={tab} />
    case "line": case "arrow": return <LineP an={ann} onPatch={onPatch} tab={tab} />
    case "text": return <TextP an={ann} onPatch={onPatch} tab={tab} />
    case "number": return <NumP an={ann} onPatch={onPatch} tab={tab} />
    case "pen": return <PenP an={ann} onPatch={onPatch} tab={tab} />
    default: return null
  }
}

function DashRow({ value, onChange }: { value?: string; onChange: (v: "solid" | "dashed" | "dotted") => void }) {
  const th = useTheme()
  const { t } = useT()
  const opts: { v: "solid" | "dashed" | "dotted"; label: string }[] = [{ v: "solid", label: "―――" }, { v: "dashed", label: "- - -" }, { v: "dotted", label: "····" }]
  const cur = value || "solid"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }}>
      <span style={{ fontSize: 10, color: th.textMuted, textTransform: "uppercase", letterSpacing: ".4px" }}>{t("strokeStyle")}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {opts.map((o) => (
          <button key={o.v} onClick={() => onChange(o.v)} title={o.v}
            style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: cur === o.v ? `1px solid ${th.accent}` : `1px solid ${th.border}`, background: cur === o.v ? th.accentSoft : th.surface, fontSize: 12, cursor: "pointer", color: th.text }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function BoxP({ an, onPatch, tab }) {
  const th = useTheme()
  const { t } = useT()
  if (tab === "arrange") {
    return (
      <Group title={t("positionSize")}>
        <Row>
          <Field label={t("x")} value={an.x} min={-5000} max={5000} onChange={(v) => onPatch({ x: v })} />
          <Field label={t("y")} value={an.y} min={-5000} max={5000} onChange={(v) => onPatch({ y: v })} />
        </Row>
        <Row>
          <Field label={t("w")} value={an.w} min={4} max={10000} onChange={(v) => onPatch({ w: v })} />
          <Field label={t("h")} value={an.h} min={4} max={10000} onChange={(v) => onPatch({ h: v })} />
        </Row>
        <Row>
          <Field label={t("rotation")} value={an.rotation} min={0} max={360} onChange={(v) => onPatch({ rotation: v })} />
          {an.type === "rrect" && <Field label={t("radius")} value={an.radius} min={0} max={200} onChange={(v) => onPatch({ radius: v })} />}
        </Row>
      </Group>
    )
  }
  return (
    <Group title={t("appearance")}>
      <ColorRow label={t("stroke")} value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
      <Row>
        <Field label={t("width")} value={an.strokeWidth} min={0} max={60} onChange={(v) => onPatch({ strokeWidth: v })} />
      </Row>
      <DashRow value={an.dash} onChange={(d) => onPatch({ dash: d })} />
      <ColorRow label={t("fill")} value={an.fill === "transparent" ? "#FFFFFF" : an.fill} onChange={(c) => onPatch({ fill: c })} />
      <button onClick={() => onPatch({ fill: "transparent" })} style={{ ...GhostBtn(th), fontSize: 11 }}>{t("makeTransparent")}</button>
      <SliderRow label={t("opacity")} value={Math.round((an.opacity ?? 1) * 100)} min={5} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} />
    </Group>
  )
}

function ImgP({ an, onPatch, tab }) {
  const { t } = useT()
  if (tab === "arrange") {
    return (
      <Group title={t("positionSize")}>
        <Row>
          <Field label={t("x")} value={an.x} onChange={(v) => onPatch({ x: v })} />
          <Field label={t("y")} value={an.y} onChange={(v) => onPatch({ y: v })} />
        </Row>
        <Row>
          <Field label={t("w")} value={an.w} min={4} onChange={(v) => onPatch({ w: v })} />
          <Field label={t("h")} value={an.h} min={4} onChange={(v) => onPatch({ h: v })} />
        </Row>
        <Row><Field label={t("rotation")} value={an.rotation} min={0} max={360} onChange={(v) => onPatch({ rotation: v })} /></Row>
      </Group>
    )
  }
  return <Group title={t("appearance")}><SliderRow label={t("opacity")} value={Math.round((an.opacity ?? 1) * 100)} min={5} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} /></Group>
}

function HiP({ an, onPatch, tab }) {
  const { t } = useT()
  if (tab === "arrange") {
    return (
      <Group title={t("positionSize")}>
        <Row><Field label={t("x")} value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label={t("y")} value={an.y} onChange={(v) => onPatch({ y: v })} /></Row>
        <Row><Field label={t("w")} value={an.w} onChange={(v) => onPatch({ w: v })} /><Field label={t("h")} value={an.h} onChange={(v) => onPatch({ h: v })} /></Row>
      </Group>
    )
  }
  return (
    <Group title={t("highlight")}>
      <ColorRow label={t("fill")} value={an.fill || "#FACC15"} onChange={(c) => onPatch({ fill: c })} />
      <SliderRow label={t("opacity")} value={Math.round((an.opacity ?? 0.3) * 100)} min={5} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} />
      <Row><Field label={t("radius")} value={an.radius} min={0} max={80} onChange={(v) => onPatch({ radius: v })} /></Row>
    </Group>
  )
}
function FXP({ an, onPatch, tab }) {
  const { t } = useT()
  const isBlur = an.type === "blur"
  if (tab === "arrange") {
    return (
      <Group title={t("positionSize")}>
        <Row><Field label={t("x")} value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label={t("y")} value={an.y} onChange={(v) => onPatch({ y: v })} /></Row>
        <Row><Field label={t("w")} value={an.w} onChange={(v) => onPatch({ w: v })} /><Field label={t("h")} value={an.h} onChange={(v) => onPatch({ h: v })} /></Row>
      </Group>
    )
  }
  return (
    <Group title={isBlur ? t("blur") : t("pixelate")}>
      <SliderRow label={isBlur ? t("strength") : t("blockSize")} value={isBlur ? an.strength ?? 12 : an.per ?? 14} min={3} max={80} onChange={(v) => onPatch(isBlur ? { strength: v } : { per: v })} />
      {isBlur && <SliderRow label={t("opacity")} value={Math.round((an.opacity ?? 1) * 100)} min={10} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} />}
    </Group>
  )
}
function CallP({ an, onPatch, tab }) {
  const { t } = useT()
  if (tab === "arrange") {
    return (
      <Group title={t("positionSize")}>
        <Row><Field label={t("w")} value={an.w} onChange={(v) => onPatch({ w: v })} /><Field label={t("h")} value={an.h} onChange={(v) => onPatch({ h: v })} /></Row>
        <Row><Field label={t("tailX")} value={an.tailX} onChange={(v) => onPatch({ tailX: v })} /><Field label={t("tailY")} value={an.tailY} onChange={(v) => onPatch({ tailY: v })} /></Row>
      </Group>
    )
  }
  return (
    <>
      <Group title={t("text")}>
        <TextAreaInput value={an.text} onChange={(v) => onPatch({ text: v })} />
        <Row><Field label={t("font")} value={an.fontSize} min={8} max={96} onChange={(v) => onPatch({ fontSize: v })} /></Row>
      </Group>
      <Group title={t("style")}>
        <ColorRow label={t("background")} value={an.bg} onChange={(c) => onPatch({ bg: c })} />
        <ColorRow label={t("border")} value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
        <Row><Field label={t("radius")} value={an.radius} min={0} max={40} onChange={(v) => onPatch({ radius: v })} /><Field label={t("padding")} value={an.padding} min={0} max={40} onChange={(v) => onPatch({ padding: v })} /></Row>
      </Group>
    </>
  )
}
function LineP({ an, onPatch, tab }) {
  const { t } = useT()
  const isArrow = an.type === "arrow"
  if (tab === "arrange") {
    return (
      <Group title={t("position")}>
        <Row><Field label={t("x1")} value={an.x1} onChange={(v) => onPatch({ x1: v })} /><Field label={t("y1")} value={an.y1} onChange={(v) => onPatch({ y1: v })} /></Row>
        <Row><Field label={t("x2")} value={an.x2} onChange={(v) => onPatch({ x2: v })} /><Field label={t("y2")} value={an.y2} onChange={(v) => onPatch({ y2: v })} /></Row>
      </Group>
    )
  }
  return (
    <Group title={isArrow ? t("arrow") : t("line")}>
      <ColorRow label={t("color")} value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
      <Row><Field label={t("width")} value={an.strokeWidth} min={1} max={60} onChange={(v) => onPatch({ strokeWidth: v })} /></Row>
      <DashRow value={an.dash} onChange={(d) => onPatch({ dash: d })} />
      {isArrow && (
        <Row>
          <Field label={t("headType")} value={an.headType === "lines" ? 1 : an.headType === "none" ? 2 : 0} min={0} max={2} onChange={(v) => onPatch({ headType: v === 0 ? "triangle" : v === 1 ? "lines" : "none" })} />
        </Row>
      )}
    </Group>
  )
}
function TextP({ an, onPatch, tab }) {
  const { t } = useT()
  if (tab === "arrange") {
    return (
      <Group title={t("position")}>
        <Row><Field label={t("x")} value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label={t("y")} value={an.y} onChange={(v) => onPatch({ y: v })} /></Row>
        <Row><Field label={t("rotation")} value={an.rotation} min={0} max={360} onChange={(v) => onPatch({ rotation: v })} /></Row>
      </Group>
    )
  }
  return (
    <>
      <Group title={t("text")}><TextAreaInput value={an.text} onChange={(v) => onPatch({ text: v })} /></Group>
      <Group title={t("typography")}>
        <Row>
          <Field label={t("size")} value={an.fontSize} min={8} max={200} onChange={(v) => onPatch({ fontSize: v })} />
          <Field label={t("weight")} value={an.fontWeight} min={100} max={900} step={100} onChange={(v) => onPatch({ fontWeight: v })} />
        </Row>
        <Row><SegAlign value={an.align} onChange={(v) => onPatch({ align: v })} /></Row>
        <ColorRow label={t("color")} value={an.color} onChange={(c) => onPatch({ color: c })} />
      </Group>
      <Group title={t("background")}>
        <ColorRow label={t("fill")} value={an.bg === "transparent" ? "#FFFFFF" : an.bg} onChange={(c) => onPatch({ bg: c })} />
        {an.bg !== "transparent" && <SliderRow label={t("bgOpacity")} value={Math.round((an.bgOpacity ?? 1) * 100)} min={10} max={100} onChange={(v) => onPatch({ bgOpacity: v / 100 })} />}
        <Row><Field label={t("padding")} value={an.padding} min={0} max={60} onChange={(v) => onPatch({ padding: v })} /><Field label={t("radius")} value={an.radius} min={0} max={40} onChange={(v) => onPatch({ radius: v })} /></Row>
      </Group>
    </>
  )
}
function NumP({ an, onPatch, tab }) {
  const { t } = useT()
  if (tab === "arrange") {
    return <Group title={t("position")}><Row><Field label={t("x")} value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label={t("y")} value={an.y} onChange={(v) => onPatch({ y: v })} /></Row></Group>
  }
  return (
    <Group title={`${t("number")} ${an.n}`}>
      <Row><Field label={t("number")} value={an.n} min={0} max={999} onChange={(v) => onPatch({ n: v })} /><Field label={t("size")} value={an.r} min={8} max={160} onChange={(v) => onPatch({ r: v })} /></Row>
      <ColorRow label={t("fill")} value={an.fill} onChange={(c) => onPatch({ fill: c })} />
      <ColorRow label={t("textColor")} value={an.color} onChange={(c) => onPatch({ color: c })} />
      <ColorRow label={t("border")} value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
    </Group>
  )
}
function PenP({ an, onPatch, tab }) {
  const { t } = useT()
  if (tab === "arrange") return <Group title={t("position")}><div style={{ fontSize: 12, color: "#555" }}>{t("dragToMove")}</div></Group>
  return (
    <Group title={t("pen")}>
      <ColorRow label={t("color")} value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
      <SliderRow label={t("width")} value={an.strokeWidth} min={1} max={40} onChange={(v) => onPatch({ strokeWidth: v })} />
    </Group>
  )
}

const GhostBtn = (th: Theme) => ({ padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: `1px solid ${th.border}`, background: th.surface, color: th.text, fontWeight: 600 })
