# Editor Redesign + Upload/Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Screenshot Annotator Palette plugin's editor UI up to the target mockup (Pages+Layers left column, canvas-top transform toolbar, richer Style/Arrange properties panel, background upload/replace/clear) and fix three pre-existing bugs that block functionality the redesign depends on.

**Architecture:** Pure frontend change inside the existing React (no build step beyond what `@palettelab/cli`/`pltt` already provides) plugin frontend at `frontend/src/`. No backend or manifest changes. New logic slots into the existing `Ann`/`Project`/`Page` data model (`types.ts`), the existing pure-function engine (`engine.ts`/`draw.ts`), and the existing component tree (`editor.tsx`/`panels.tsx`), following the file's established patterns (inline style objects, no CSS framework, `snap()`/`pushHist()`/`setDirty()` for every mutation so undo/redo and autosave keep working).

**Tech Stack:** React 19, TypeScript, `@palettelab/sdk` (frontend), `palette_sdk` (Python backend, untouched by this plan), `jspdf`, Palette `pltt` CLI for local dev/verification.

## Global Constraints

- No JS test runner is configured in this project (no `jest`/`vitest` config, no `test` script in `package.json`) — this is a `pltt`-managed Palette plugin, verified via `pltt build` (manifest/entry-point validation), `pltt test` (plugin contract checks), and `pltt dev` (local SDK simulator) + manual browser interaction. Every task below substitutes **manual verification in the running simulator** for the usual failing-test-first cycle; there is no unit test suite to add tests to.
- Storage stays 100% client-side (`localStorage` via `persist.ts`); `palette-plugin.json`'s `capabilities.file_uploads` stays `false`. Do not add backend upload endpoints.
- All new annotation mutations must go through the existing undo/redo pattern: capture `snap()` before the change, apply the change, then `pushHist(before)`, and call `setDirty(true)` — matching every existing mutator in `editor.tsx` (e.g. `updSel`, `removeSel`, `dupSel`).
- Match existing code style: inline `style={{...}}` objects, no semicolons-optional inconsistency beyond what's already there, `#2563EB` as the one accent color, `Inter, -apple-system, sans-serif` font stack.
- Existing single-letter tool shortcuts already in use (don't reassign): `v r a t c b h n l p x k`. New shortcuts must avoid these.

---

### Task 1: Fix `onProject`/`onChange` prop mismatch and PDF export crash

**Files:**
- Modify: `frontend/src/index.tsx:41` (the `<Editor .../>` call)
- Modify: `frontend/src/export.tsx:56-69` (`doExport`'s PDF branch)

**Interfaces:**
- Consumes: `Editor`'s existing `Props` type (`frontend/src/editor.tsx:17-22`), which already declares `onProject: (p: Project) => void` — unchanged by this task.
- Produces: nothing new; this task only removes two crashes.

- [ ] **Step 1: Fix the prop name**

In `frontend/src/index.tsx`, change:

```tsx
<Editor key={project.id} project={project} onChange={saveProject} onExit={() => setProject(null)} onToast={toast} />
```

to:

```tsx
<Editor key={project.id} project={project} onProject={saveProject} onExit={() => setProject(null)} onToast={toast} />
```

- [ ] **Step 2: Fix the undefined `pdfScale1` reference**

In `frontend/src/export.tsx`, the PDF branch of `doExport` currently reads:

```tsx
const pdf = new jsPDF({ orientation: project.pages[0]?.w > project.pages[0]?.h ? "landscape" : "portrait", unit: "mm", format: "a4" })
for (let i = 0; i < project.pages.length; i++) {
  const pg = project.pages[i]
  const cv = renderPageCanvas(pg, pdfScale(pg), bg)
  await ready(cv)
  const jpeg = cv.toDataURL("image/jpeg", 0.92)
  const pw = pdf.internal.pageSize.getWidth()
  const ph = pdf.internal.pageSize.getHeight()
  const k = Math.min(pw / (pg.w * pdfScale1), ph / (pg.h * pdfScale1))
  const dw = (pg.w * pdfScale1) * k
  const dh = (pg.h * pdfScale1) * k
  pdf.addImage(jpeg, "JPEG", (pw - dw) / 2, (ph - dh) / 2, dw, dh, undefined, "FAST")
  if (i < project.pages.length - 1) pdf.addPage()
}
```

Replace it with (hoisting the one scale value the loop actually needs, `pdfScale(pg)`, into a local so it's computed once and reused for both the render call and the placement math):

```tsx
const pdf = new jsPDF({ orientation: project.pages[0]?.w > project.pages[0]?.h ? "landscape" : "portrait", unit: "mm", format: "a4" })
for (let i = 0; i < project.pages.length; i++) {
  const pg = project.pages[i]
  const s1 = pdfScale(pg)
  const cv = renderPageCanvas(pg, s1, bg)
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
```

- [ ] **Step 3: Manual verification**

Run: `npx --yes @palettelab/cli@latest dev` from the project root, open the printed local preview URL.
- Upload any image, add a rectangle annotation, wait ~1s for the "Saved" indicator, click Home — the project must now appear in Recent with an up-to-date thumbnail (previously it silently never refreshed).
- Reopen the project, click Export → PDF → Export. The download must succeed with no console error mentioning `pdfScale1`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.tsx frontend/src/export.tsx
git commit -m "fix: correct Editor onProject prop name and undefined pdfScale1 in PDF export"
```

---

### Task 2: Shared file/image helpers

**Files:**
- Create: `frontend/src/files.ts`
- Modify: `frontend/src/home.tsx:1-14` (remove local `readImageFile`, import shared one)

**Interfaces:**
- Produces:
  - `readImageFile(file: File, cb: (dataUrl: string, w: number, h: number, name: string) => void): void`
  - `blankCanvasDataUrl(w: number, h: number): string`
  - `cropDataUrl(dataUrl: string, pageW: number, pageH: number, rect: { x: number; y: number; w: number; h: number }): Promise<string>`
- Consumed by: Task 10 (background upload/clear, crop apply), Task 8 (page-add drag/drop card), `home.tsx`.

- [ ] **Step 1: Create `frontend/src/files.ts`**

```ts
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
```

- [ ] **Step 2: Update `home.tsx` to use the shared helper**

Delete the local `readImageFile` function (`frontend/src/home.tsx:6-14`) and add to the top imports:

```tsx
import { readImageFile } from "./files"
```

- [ ] **Step 3: Manual verification**

Run `npx --yes @palettelab/cli@latest dev`, confirm the Home screen's drag-and-drop and "Browse files" upload still create a new project exactly as before (no behavior change expected — this step only proves the extraction didn't break anything).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/files.ts frontend/src/home.tsx
git commit -m "refactor: extract shared file/image helpers to files.ts"
```

---

### Task 3: Data model additions (`types.ts`)

**Files:**
- Modify: `frontend/src/types.ts`

**Interfaces:**
- Produces: `ImageAnn` type, `AnnBase.locked?`, `AnnBase.flipX?`, `AnnBase.flipY?`, `BoxAnn.dash?`, `LineAnn.dash?`, `Ann` union including `ImageAnn`, `AnnType`/`Node` including `"image"`, `defaultAnn("image", seed)`.
- Consumed by: Tasks 4, 5, 6, 7, 8, 9, 10.

- [ ] **Step 1: Extend `AnnBase` (types.ts:20-26)**

```ts
export interface AnnBase {
  id: string
  visible: boolean
  rotation: number
  opacity: number
  name?: string
  locked?: boolean
  flipX?: boolean
  flipY?: boolean
}
```

- [ ] **Step 2: Add `dash` to `BoxAnn` and `LineAnn`**

In `BoxAnn` (types.ts:28-43), add one field after `strokeWidth: number`:

```ts
  strokeWidth: number
  dash?: "solid" | "dashed" | "dotted"
```

In `LineAnn` (types.ts:45-56), add the same field after `strokeWidth: number`:

```ts
  strokeWidth: number
  dash?: "solid" | "dashed" | "dotted"
```

- [ ] **Step 3: Add `ImageAnn` and extend the `Ann`/`AnnType` unions**

Add `"image"` to `AnnType` (types.ts:1-13):

```ts
export type AnnType =
  | "rect"
  | "rrect"
  | "callout"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "number"
  | "pen"
  | "highlight"
  | "blur"
  | "pixelate"
  | "image"
```

Add the new interface right after `PenAnn` (types.ts, after line 109):

```ts
export interface ImageAnn extends AnnBase {
  type: "image"
  x: number
  y: number
  w: number
  h: number
  dataUrl: string
}
```

Update the `Ann` union (types.ts:111):

```ts
export type Ann = BoxAnn | LineAnn | TextAnn | CalloutAnn | NumberAnn | PenAnn | ImageAnn
```

- [ ] **Step 4: Add a `defaultAnn` case for `"image"`**

In the `switch (type)` inside `defaultAnn` (types.ts:179-206), add a case before `default:`:

```ts
    case "image":
      return { ...base, type, x: s.x || 0, y: s.y || 0, w: s.w || 200, h: s.h || 150, dataUrl: (s as ImageAnn).dataUrl || "" }
```

- [ ] **Step 5: Extend `Node` (types.ts:208-221)**

```ts
export type Node =
  | "select"
  | "rect"
  | "rrect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "number"
  | "pen"
  | "highlight"
  | "blur"
  | "pixelate"
  | "callout"
  | "image"
  | "eraser"
  | "crop"
  | "insertImage"
  | "background"
```

- [ ] **Step 6: Manual verification**

Run `npx --yes @palettelab/cli@latest build` from the project root — it must exit successfully (this only validates the manifest/entry points, not TypeScript, but confirms the plugin still bundles). Since there's no standalone `tsc` script in `package.json`, visually re-check the four edited blocks for typos (unbalanced braces, missing commas) before moving on — a real type error here will only surface as a build failure in a later task once these types are consumed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add ImageAnn type and locked/flip/dash annotation fields"
```

---

### Task 4: Icons, tool registry, and engine `Tool` union

**Files:**
- Modify: `frontend/src/icons.tsx` (add 3 icons)
- Modify: `frontend/src/tools.ts` (labels for all tools + 4 new entries)
- Modify: `frontend/src/engine.ts:6` (`Tool` union) and `frontend/src/engine.ts:19-21` (`isBoxAnn`)

**Interfaces:**
- Consumes: `I` icon map (`icons.tsx`), `ImageAnn`/`Node` from Task 3.
- Produces: `TOOLS` entries for `eraser`/`crop`/`insertImage`/`background`; `Tool` type now includes them; `isBoxAnn` now treats `"image"` as box-like (so resize/rotate/move handles work on inserted images for free via existing generic code in `engine.ts`/`editor.tsx`).

- [ ] **Step 1: Add three icons to `icons.tsx`**

Add to the `I` object (icons.tsx, anywhere among the other entries, e.g. right after `pixelate`):

```tsx
  eraser: <Ic d={["M20 20H8l-6-6a2 2 0 0 1 0-2.8L13.2 2a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L11 20"]} />,
  insertImage: <Ic d={["M4 4h16v16H4z", "M4 16l5-5 4 4 3-3 4 4", "M9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3"]} />,
  background: <Ic d={["M3 3h18v18H3z", "M3 16l5-5 4 4 5-5 4 4"]} />,
```

- [ ] **Step 2: Add labels to every `TOOLS` entry and append the 4 new tools**

Replace the whole `TOOLS` array in `tools.ts` (currently lines 5-19):

```ts
export type Tool = "select" | "rect" | "rrect" | "ellipse" | "line" | "arrow" | "text" | "number" | "pen" | "highlight" | "blur" | "pixelate" | "callout" | "eraser" | "crop" | "insertImage" | "background"

export const TOOLS: { t: Tool; label: string; icon: any; key?: string }[] = [
  { t: "select", label: "Select", icon: I.select, key: "V" },
  { t: "rect", label: "Rectangle", icon: I.rect, key: "R" },
  { t: "rrect", label: "Rounded Rect", icon: I.rrect },
  { t: "ellipse", label: "Circle / Ellipse", icon: I.circle, key: "C" },
  { t: "arrow", label: "Arrow", icon: I.arrow, key: "A" },
  { t: "line", label: "Line", icon: I.line, key: "L" },
  { t: "text", label: "Text", icon: I.text, key: "T" },
  { t: "number", label: "Number", icon: I.number, key: "N" },
  { t: "callout", label: "Callout", icon: I.callout, key: "K" },
  { t: "highlight", label: "Highlight", icon: I.highlight, key: "H" },
  { t: "blur", label: "Blur", icon: I.blur, key: "B" },
  { t: "pixelate", label: "Pixelate", icon: I.pixelate, key: "X" },
  { t: "eraser", label: "Eraser", icon: I.eraser, key: "E" },
  { t: "pen", label: "Pen / Draw", icon: I.pen, key: "P" },
  { t: "crop", label: "Crop", icon: I.crop, key: "O" },
  { t: "insertImage", label: "Insert Image", icon: I.insertImage },
  { t: "background", label: "Background", icon: I.background },
]
```

Note: `crop` and `background` also declared in the plan's Task 9/10 as canvas-top-toolbar / footer shortcuts respectively — those call the same handlers this rail entry uses (selecting the `crop` tool, or opening the background file picker); there's no duplicate logic, just two entry points into the same functions.

Update `TOOL_KEY` (tools.ts, currently line 21-23):

```ts
export const TOOL_KEY: Record<string, Tool> = {
  v: "select", r: "rect", a: "arrow", t: "text", c: "ellipse", b: "blur", h: "highlight", n: "number", l: "line", p: "pen", x: "pixelate", k: "callout", e: "eraser", o: "crop",
}
```

Update `isBoxTool` (tools.ts, currently line 25-27) to keep `image` insertion out of the drag-draft box tools (it's inserted via file picker, not drag) — no change needed there, but add `image` to `TYPE_NAME` (tools.ts, currently line 32-35):

```ts
export const TYPE_NAME: Record<string, string> = {
  rect: "Rectangle", rrect: "Rounded rect", ellipse: "Ellipse", line: "Line", arrow: "Arrow", text: "Text",
  number: "Number", pen: "Pen", highlight: "Highlight", blur: "Blur", pixelate: "Pixelate", callout: "Callout", image: "Image",
}
```

- [ ] **Step 3: Extend `engine.ts`'s `Tool` union and `isBoxAnn`**

Replace `engine.ts:6`:

```ts
export type Tool = "select" | "rect" | "rrect" | "ellipse" | "line" | "arrow" | "text" | "number" | "pen" | "highlight" | "blur" | "pixelate" | "callout" | "eraser" | "crop" | "insertImage" | "background"
```

Replace `isBoxAnn` (engine.ts:19-21):

```ts
export function isBoxAnn(a: Ann): boolean {
  return ["rect", "rrect", "ellipse", "highlight", "blur", "pixelate", "callout", "image"].includes(a.type)
}
```

- [ ] **Step 4: Manual verification**

Run `npx --yes @palettelab/cli@latest dev`. Confirm the tool rail now shows a label next to every icon, and the new Eraser/Crop/Insert Image/Background entries render (they won't do anything functional yet — that's Task 10 — just confirm no crash and no duplicate/missing icons).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/icons.tsx frontend/src/tools.ts frontend/src/engine.ts
git commit -m "feat: add eraser/crop/insertImage/background tools to the tool registry"
```

---

### Task 5: `draw.ts` — image rendering, dash, flip, image cache

**Files:**
- Modify: `frontend/src/draw.ts`

**Interfaces:**
- Consumes: `ImageAnn` (Task 3), `dash`/`flipX`/`flipY` fields (Task 3).
- Produces: `drawAnn(ctx, a, onImageLoad?)` (signature gains a third optional param — existing call sites must be updated, see Task 10/11), `preloadAnnImages(anns: Ann[]): Promise<void>`, `annBounds`/`hitOne` now handle `"image"`.

- [ ] **Step 1: Add the module-level image cache and preload helper**

Add near the top of `draw.ts`, after the existing imports:

```ts
const imageCache = new Map<string, HTMLImageElement>()

function getCachedImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  const cached = imageCache.get(src)
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null
  const img = new Image()
  img.onload = () => onLoad && onLoad()
  img.src = src
  imageCache.set(src, img)
  return null
}

export function preloadAnnImages(anns: Ann[]): Promise<void> {
  const urls = anns.filter((a) => a.type === "image").map((a) => (a as any).dataUrl as string)
  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          if (getCachedImage(src, resolve)) resolve()
        })
    )
  ).then(() => undefined)
}
```

- [ ] **Step 2: Add the `"image"` case to `annBounds` (draw.ts:28-53)**

```ts
export function annBounds(a: Ann): Bounds {
  switch (a.type) {
    case "rect":
    case "rrect":
    case "ellipse":
    case "highlight":
    case "blur":
    case "pixelate":
    case "callout":
    case "image":
      return { x: a.x, y: a.y, w: a.w, h: a.h }
    case "line":
    case "arrow":
      return {
        x: Math.min(a.x1, a.x2),
        y: Math.min(a.y1, a.y2),
        w: Math.abs(a.x2 - a.x1),
        h: Math.abs(a.y2 - a.y1),
      }
    case "text":
      return { x: a.x, y: a.y, w: a.w || 80, h: a.h || 0 }
    case "number":
      return { x: a.x - a.r, y: a.y - a.r, w: a.r * 2, h: a.r * 2 }
    case "pen":
      return penBounds(a)
  }
}
```

- [ ] **Step 3: Add the `"image"` case to `hitOne` (draw.ts:100-123)**

Add one line to the first `case` group (rect/rrect/highlight/callout already share a body — image needs its own since it has no `tol`-independent look, same rectangular test is fine):

```ts
    case "rect":
    case "rrect":
    case "highlight":
    case "callout":
    case "image":
      return pt.x >= a.x - tol && pt.x <= a.x + a.w + tol && pt.y >= a.y - tol && pt.y <= a.y + a.h + tol
```

- [ ] **Step 4: Add dash support to box strokes and lines**

Add a small helper right before `strokeRectCtx` (draw.ts, before line 204):

```ts
function applyDash(ctx: CanvasRenderingContext2D, dash: "solid" | "dashed" | "dotted" | undefined, sw: number) {
  if (dash === "dashed") ctx.setLineDash([sw * 2.5, sw * 1.8])
  else if (dash === "dotted") ctx.setLineDash([sw * 0.9, sw * 1.4])
  else ctx.setLineDash([])
}
```

Update `strokeRectCtx` (draw.ts:204-211) to call it:

```ts
function strokeRectCtx(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, b?: Partial<BoxAnn>) {
  const fill = (b as BoxAnn)?.fill
  const stroke = (b as BoxAnn)?.stroke
  const sw = (b as BoxAnn)?.strokeWidth
  roundRectPath(ctx, x, y, w, h, r)
  if (fill && fill !== "transparent") { ctx.fillStyle = fill; ctx.fill() }
  if (stroke && stroke !== "transparent" && sw && sw > 0) {
    applyDash(ctx, (b as BoxAnn)?.dash, sw)
    ctx.strokeStyle = stroke
    ctx.lineWidth = sw
    ctx.stroke()
    ctx.setLineDash([])
  }
}
```

Update the ellipse branch inside `drawAnn` (draw.ts:160-164) similarly:

```ts
      else if (b.type === "ellipse") {
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.abs(b.w) / 2, Math.abs(b.h) / 2, 0, 0, Math.PI * 2)
        if (b.fill && b.fill !== "transparent") { ctx.fillStyle = b.fill; ctx.fill() }
        if (b.stroke && b.stroke !== "transparent" && b.strokeWidth > 0) {
          applyDash(ctx, b.dash, b.strokeWidth)
          ctx.strokeStyle = b.stroke; ctx.lineWidth = b.strokeWidth; ctx.stroke()
          ctx.setLineDash([])
        }
      }
```

Update the line/arrow branch (draw.ts:174-186):

```ts
    case "line":
    case "arrow": {
      const l = a as LineAnn
      ctx.strokeStyle = l.stroke
      ctx.lineWidth = l.strokeWidth
      ctx.lineCap = "round"
      applyDash(ctx, l.dash, l.strokeWidth)
      ctx.beginPath()
      ctx.moveTo(l.x1, l.y1)
      ctx.lineTo(l.x2, l.y2)
      ctx.stroke()
      ctx.setLineDash([])
      if (l.headType !== "none") arrowHead(ctx, l.x1, l.y1, l.x2, l.y2, l.stroke, l.strokeWidth, l.headType)
      break
    }
```

- [ ] **Step 5: Add flip transform and the `"image"` draw case, update `drawAnn`'s signature**

Replace the box-drawing branch's rotation setup (draw.ts:154-169) to also apply flip, and change the function signature (draw.ts:149):

```ts
export function drawAnn(ctx: CanvasRenderingContext2D, a: Ann, onImageLoad?: () => void) {
  if (a.visible === false) return
  ctx.save()
  ctx.globalAlpha = a.opacity ?? 1
  switch (a.type) {
    case "rect": case "rrect": case "ellipse": case "highlight": {
      const b = a as BoxAnn
      const rot = b.rotation || 0
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2
      if (rot) { ctx.translate(cx, cy); ctx.rotate((rot * Math.PI) / 180); ctx.translate(-cx, -cy) }
      if (b.flipX || b.flipY) { ctx.translate(cx, cy); ctx.scale(b.flipX ? -1 : 1, b.flipY ? -1 : 1); ctx.translate(-cx, -cy) }
      if (b.type === "highlight") drawHighlight(ctx, b)
      else if (b.type === "ellipse") {
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.abs(b.w) / 2, Math.abs(b.h) / 2, 0, 0, Math.PI * 2)
        if (b.fill && b.fill !== "transparent") { ctx.fillStyle = b.fill; ctx.fill() }
        if (b.stroke && b.stroke !== "transparent" && b.strokeWidth > 0) {
          applyDash(ctx, b.dash, b.strokeWidth)
          ctx.strokeStyle = b.stroke; ctx.lineWidth = b.strokeWidth; ctx.stroke()
          ctx.setLineDash([])
        }
      } else {
        strokeRectCtx(ctx, b.x, b.y, b.w, b.h, b.type === "rrect" ? b.radius : 0, b)
      }
      break
    }
    case "image": {
      const im = a as ImageAnn
      const rot = im.rotation || 0
      const cx = im.x + im.w / 2, cy = im.y + im.h / 2
      if (rot) { ctx.translate(cx, cy); ctx.rotate((rot * Math.PI) / 180); ctx.translate(-cx, -cy) }
      if (im.flipX || im.flipY) { ctx.translate(cx, cy); ctx.scale(im.flipX ? -1 : 1, im.flipY ? -1 : 1); ctx.translate(-cx, -cy) }
      const img = getCachedImage(im.dataUrl, onImageLoad)
      if (img) ctx.drawImage(img, im.x, im.y, im.w, im.h)
      break
    }
```

(The rest of the `switch` — `blur`/`pixelate`/`line`/`arrow`/`text`/`callout`/`number`/`pen` — is unchanged, just keep it below this block exactly as it is today at draw.ts:170-199.)

Add `ImageAnn` to the top-of-file type import (draw.ts:1):

```ts
import type { Ann, BoxAnn, CalloutAnn, ImageAnn, LineAnn, NumberAnn, PenAnn, Pt, TextAnn } from "./types"
```

- [ ] **Step 6: Manual verification**

This task has no user-facing entry point yet (Insert Image tool isn't wired until Task 10). Verify by running `npx --yes @palettelab/cli@latest dev` and confirming the existing tools (rect/ellipse/arrow/line) still draw identically — dash defaults to `undefined` which `applyDash` treats as solid, so there must be zero visual change for existing annotations.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/draw.ts
git commit -m "feat: draw.ts support for image annotations, stroke dash, and flip"
```

---

### Task 6: `engine.ts` — crop helpers

**Files:**
- Modify: `frontend/src/engine.ts`

**Interfaces:**
- Consumes: `annBounds` from `draw.ts`, `Page` from `types.ts`, `movePatch` (already in this file).
- Produces: `applyCrop(page: Page, rect: B): Page` — consumed by Task 10's crop-tool apply handler.

- [ ] **Step 1: Import `annBounds` and `Page`**

Update the type-only import at the top of `engine.ts:1-4`:

```ts
import type { Ann, BoxAnn, CalloutAnn, LineAnn, NumberAnn, Page, PenAnn, TextAnn } from "./types"
import { defaultAnn } from "./types"
import type { HandleKey } from "./draw"
import { annBounds, computeTextBounds, isLineLike, handlePos } from "./draw"
```

- [ ] **Step 2: Add `applyCrop`**

Append to the end of `engine.ts`:

```ts
export function applyCrop(page: Page, rect: B): Page {
  const rx = Math.max(0, Math.round(rect.x))
  const ry = Math.max(0, Math.round(rect.y))
  const rw = Math.max(1, Math.round(rect.w))
  const rh = Math.max(1, Math.round(rect.h))
  const anns = page.annotations
    .map((a) => ({ ...a, ...movePatch(a, -rx, -ry) } as Ann))
    .filter((a) => {
      const b = annBounds(a)
      return b.x + b.w > 0 && b.y + b.h > 0 && b.x < rw && b.y < rh
    })
  return { ...page, w: rw, h: rh, annotations: anns }
}
```

- [ ] **Step 3: Manual verification**

No UI hook yet (wired in Task 10). Confirm the project still builds: `npx --yes @palettelab/cli@latest build`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/engine.ts
git commit -m "feat: add applyCrop helper for cropping a page's background and remapping annotations"
```

---

### Task 7: `panels.tsx` — Style/Arrange split, fill/dash/actions rows

**Files:**
- Modify: `frontend/src/panels.tsx`

**Interfaces:**
- Consumes: `dash`/`locked`/`flipX`/`flipY` fields (Task 3).
- Produces: `RightPanel`'s `tab` prop type changes from `"props" | "layers"` to `"style" | "arrange"` — **Task 10 must update every place `editor.tsx` references `tabs`/`setTabs`/`"props"`/`"layers"`** (currently `editor.tsx:40`, `:143-148`, `:610-611`). `LayersPanel` stays exported (moves to being used by `sidebar.tsx` in Task 8, not by `RightPanel` anymore).

- [ ] **Step 1: Fix the `an`/`ann` bug and change the panel shell**

Replace `RightPanel`, `ObjectProps`, and the `P` interface (panels.tsx:118-225) with:

```tsx
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
  return (
    <aside style={{ width: 276, minWidth: 276, background: "#FFFFFF", borderLeft: "1px solid #E5E5E5", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #E5E5E5" }}>
        {(["style", "arrange"] as const).map((t) => (
          <button key={t} onClick={() => p.setTab(t)}
            style={{ flex: 1, padding: "11px 0", fontSize: 12, fontWeight: 600, border: "none", background: "none", cursor: "pointer", color: p.tab === t ? "#111" : "#999", borderBottom: p.tab === t ? "2px solid #2563EB" : "2px solid transparent", textTransform: "capitalize" }}>
            {t}
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
```

- [ ] **Step 2: Rewrite `PropsPanel` to branch on `tab` and add the Actions row**

Replace `PropsPanel` (panels.tsx, formerly lines 184-211):

```tsx
function PropsPanel({ page, ann, selCount, sw, color, zoom, tab, onZoom, onFit, onColor, onSw, onPatch, onDup, onLayers, sel }) {
  if (!ann) {
    if (tab === "arrange") {
      return <Group title="Zoom"><SliderRow label="Zoom" value={Math.round(zoom * 100)} min={10} max={400} onChange={(n) => onZoom(n / 100)} /></Group>
    }
    return (
      <div>
        <Group title="Canvas">
          <div style={{ fontSize: 12, color: "#444", display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
            {page && <div>Image size: <b>{page.w} × {page.h}</b> px</div>}
            {selCount === 0 && <button onClick={onFit} style={GhostBtn}>Fit to screen</button>}
          </div>
        </Group>
        <Group title={selCount > 1 ? `${selCount} objects selected` : "Tool style"}>
          {selCount <= 1 && (<>
            <ColorRow label="Default color" value={color} onChange={onColor} />
            <SliderRow label="Stroke width" value={sw} min={1} max={24} onChange={onSw} />
          </>)}
          {selCount > 1 && <div style={{ fontSize: 12, color: "#555" }}>Move or delete the selection together.</div>}
        </Group>
      </div>
    )
  }
  if (selCount > 1) {
    return <Group title={`${selCount} selected`}><div style={{ fontSize: 12, color: "#555" }}>Inspect a single object to change its style.</div></Group>
  }
  return (
    <>
      <ObjectProps ann={ann} onPatch={onPatch} tab={tab} />
      <ActionsRow id={ann.id} locked={!!ann.locked} visible={ann.visible !== false} onDup={onDup} onLayers={onLayers} />
    </>
  )
}

function ActionsRow({ id, locked, visible, onDup, onLayers }: { id: string; locked: boolean; visible: boolean; onDup: (id: string) => void; onLayers: (id: string, action: string) => void }) {
  const btn = { border: "1px solid #E5E5E5", background: "#fff", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#333" }
  return (
    <Group title="Actions">
      <div style={{ display: "flex", gap: 6 }}>
        <button title="Duplicate" style={btn} onClick={() => onDup(id)}>{I.copy}</button>
        <button title={locked ? "Unlock" : "Lock"} style={{ ...btn, color: locked ? "#2563EB" : "#333" }} onClick={() => onLayers(id, "lock")}>{I.link}</button>
        <button title={visible ? "Hide" : "Show"} style={btn} onClick={() => onLayers(id, "toggle")}>{visible ? I.eye : I.close}</button>
        <button title="Bring to front" style={btn} onClick={() => onLayers(id, "front")}>{I.chevR}</button>
        <button title="Send to back" style={btn} onClick={() => onLayers(id, "back")}>{I.chevD}</button>
        <button title="Delete" style={{ ...btn, color: "#DC2626" }} onClick={() => onLayers(id, "delete")}>{I.trash}</button>
      </div>
    </Group>
  )
}
```

- [ ] **Step 3: Split `ObjectProps` and each per-type component by `tab`**

Replace `ObjectProps` and `BoxP` (panels.tsx, formerly lines 213-253):

```tsx
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

function BoxP({ an, onPatch, tab }) {
  if (tab === "arrange") {
    return (
      <Group title="Position & Size">
        <Row>
          <Field label="X" value={an.x} min={-5000} max={5000} onChange={(v) => onPatch({ x: v })} />
          <Field label="Y" value={an.y} min={-5000} max={5000} onChange={(v) => onPatch({ y: v })} />
        </Row>
        <Row>
          <Field label="W" value={an.w} min={4} max={10000} onChange={(v) => onPatch({ w: v })} />
          <Field label="H" value={an.h} min={4} max={10000} onChange={(v) => onPatch({ h: v })} />
        </Row>
        <Row>
          <Field label="Rotation" value={an.rotation} min={0} max={360} onChange={(v) => onPatch({ rotation: v })} />
          {an.type === "rrect" && <Field label="Radius" value={an.radius} min={0} max={200} onChange={(v) => onPatch({ radius: v })} />}
        </Row>
      </Group>
    )
  }
  return (
    <Group title="Appearance">
      <ColorRow label="Stroke" value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
      <Row>
        <Field label="Width" value={an.strokeWidth} min={0} max={60} onChange={(v) => onPatch({ strokeWidth: v })} />
      </Row>
      <DashRow value={an.dash} onChange={(d) => onPatch({ dash: d })} />
      <ColorRow label="Fill" value={an.fill === "transparent" ? "#FFFFFF" : an.fill} onChange={(c) => onPatch({ fill: c })} />
      <button onClick={() => onPatch({ fill: "transparent" })} style={{ ...GhostBtn, fontSize: 11 }}>Make transparent</button>
      <SliderRow label="Opacity" value={Math.round((an.opacity ?? 1) * 100)} min={5} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} />
    </Group>
  )
}

function DashRow({ value, onChange }: { value?: string; onChange: (v: "solid" | "dashed" | "dotted") => void }) {
  const opts: { v: "solid" | "dashed" | "dotted"; label: string }[] = [{ v: "solid", label: "―――" }, { v: "dashed", label: "- - -" }, { v: "dotted", label: "····" }]
  const cur = value || "solid"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }}>
      <span style={{ fontSize: 10, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".4px" }}>Stroke Style</span>
      <div style={{ display: "flex", gap: 4 }}>
        {opts.map((o) => (
          <button key={o.v} onClick={() => onChange(o.v)} title={o.v}
            style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: cur === o.v ? "1px solid #2563EB" : "1px solid #E5E5E5", background: cur === o.v ? "#EFF6FF" : "#fff", fontSize: 12, cursor: "pointer" }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ImgP({ an, onPatch, tab }) {
  if (tab === "arrange") {
    return (
      <Group title="Position & Size">
        <Row>
          <Field label="X" value={an.x} onChange={(v) => onPatch({ x: v })} />
          <Field label="Y" value={an.y} onChange={(v) => onPatch({ y: v })} />
        </Row>
        <Row>
          <Field label="W" value={an.w} min={4} onChange={(v) => onPatch({ w: v })} />
          <Field label="H" value={an.h} min={4} onChange={(v) => onPatch({ h: v })} />
        </Row>
        <Row><Field label="Rotation" value={an.rotation} min={0} max={360} onChange={(v) => onPatch({ rotation: v })} /></Row>
      </Group>
    )
  }
  return <Group title="Appearance"><SliderRow label="Opacity" value={Math.round((an.opacity ?? 1) * 100)} min={5} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} /></Group>
}
```

- [ ] **Step 4: Split `HiP`, `FXP`, `CallP`, `LineP`, `TextP`, `NumP`, `PenP` by `tab`**

Replace each with a `tab`-aware version (panels.tsx, formerly lines 255-390). Position/size-ish fields go under `"arrange"`, appearance under `"style"`:

```tsx
function HiP({ an, onPatch, tab }) {
  if (tab === "arrange") {
    return (
      <Group title="Position & Size">
        <Row><Field label="X" value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label="Y" value={an.y} onChange={(v) => onPatch({ y: v })} /></Row>
        <Row><Field label="W" value={an.w} onChange={(v) => onPatch({ w: v })} /><Field label="H" value={an.h} onChange={(v) => onPatch({ h: v })} /></Row>
      </Group>
    )
  }
  return (
    <Group title="Highlight">
      <ColorRow label="Fill" value={an.fill || "#FACC15"} onChange={(c) => onPatch({ fill: c })} />
      <SliderRow label="Opacity" value={Math.round((an.opacity ?? 0.3) * 100)} min={5} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} />
      <Row><Field label="Radius" value={an.radius} min={0} max={80} onChange={(v) => onPatch({ radius: v })} /></Row>
    </Group>
  )
}

function FXP({ an, onPatch, tab }) {
  const isBlur = an.type === "blur"
  if (tab === "arrange") {
    return (
      <Group title="Position & Size">
        <Row><Field label="X" value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label="Y" value={an.y} onChange={(v) => onPatch({ y: v })} /></Row>
        <Row><Field label="W" value={an.w} onChange={(v) => onPatch({ w: v })} /><Field label="H" value={an.h} onChange={(v) => onPatch({ h: v })} /></Row>
      </Group>
    )
  }
  return (
    <Group title={isBlur ? "Blur" : "Pixelate"}>
      <SliderRow label={isBlur ? "Strength" : "Block size"} value={isBlur ? an.strength ?? 12 : an.per ?? 14} min={3} max={80} onChange={(v) => onPatch(isBlur ? { strength: v } : { per: v })} />
      {isBlur && <SliderRow label="Opacity" value={Math.round((an.opacity ?? 1) * 100)} min={10} max={100} onChange={(v) => onPatch({ opacity: v / 100 })} />}
    </Group>
  )
}

function CallP({ an, onPatch, tab }) {
  if (tab === "arrange") {
    return (
      <Group title="Position & Size">
        <Row><Field label="W" value={an.w} onChange={(v) => onPatch({ w: v })} /><Field label="H" value={an.h} onChange={(v) => onPatch({ h: v })} /></Row>
        <Row><Field label="Tail X" value={an.tailX} onChange={(v) => onPatch({ tailX: v })} /><Field label="Tail Y" value={an.tailY} onChange={(v) => onPatch({ tailY: v })} /></Row>
      </Group>
    )
  }
  return (
    <>
      <Group title="Text">
        <TextAreaInput value={an.text} onChange={(v) => onPatch({ text: v })} />
        <Row><Field label="Font" value={an.fontSize} min={8} max={96} onChange={(v) => onPatch({ fontSize: v })} /></Row>
      </Group>
      <Group title="Style">
        <ColorRow label="Background" value={an.bg} onChange={(c) => onPatch({ bg: c })} />
        <ColorRow label="Border" value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
        <Row><Field label="Radius" value={an.radius} min={0} max={40} onChange={(v) => onPatch({ radius: v })} /><Field label="Padding" value={an.padding} min={0} max={40} onChange={(v) => onPatch({ padding: v })} /></Row>
      </Group>
    </>
  )
}

function LineP({ an, onPatch, tab }) {
  const isArrow = an.type === "arrow"
  if (tab === "arrange") {
    return (
      <Group title="Position">
        <Row><Field label="X1" value={an.x1} onChange={(v) => onPatch({ x1: v })} /><Field label="Y1" value={an.y1} onChange={(v) => onPatch({ y1: v })} /></Row>
        <Row><Field label="X2" value={an.x2} onChange={(v) => onPatch({ x2: v })} /><Field label="Y2" value={an.y2} onChange={(v) => onPatch({ y2: v })} /></Row>
      </Group>
    )
  }
  return (
    <Group title={isArrow ? "Arrow" : "Line"}>
      <ColorRow label="Color" value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
      <Row><Field label="Width" value={an.strokeWidth} min={1} max={60} onChange={(v) => onPatch({ strokeWidth: v })} /></Row>
      <DashRow value={an.dash} onChange={(d) => onPatch({ dash: d })} />
      {isArrow && (
        <Row>
          <Field label="Head (0 tri, 1 lines, 2 none)" value={an.headType === "lines" ? 1 : an.headType === "none" ? 2 : 0} min={0} max={2} onChange={(v) => onPatch({ headType: v === 0 ? "triangle" : v === 1 ? "lines" : "none" })} />
        </Row>
      )}
    </Group>
  )
}

function TextP({ an, onPatch, tab }) {
  if (tab === "arrange") {
    return (
      <Group title="Position">
        <Row><Field label="X" value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label="Y" value={an.y} onChange={(v) => onPatch({ y: v })} /></Row>
        <Row><Field label="Rotation" value={an.rotation} min={0} max={360} onChange={(v) => onPatch({ rotation: v })} /></Row>
      </Group>
    )
  }
  return (
    <>
      <Group title="Text"><TextAreaInput value={an.text} onChange={(v) => onPatch({ text: v })} /></Group>
      <Group title="Typography">
        <Row>
          <Field label="Size" value={an.fontSize} min={8} max={200} onChange={(v) => onPatch({ fontSize: v })} />
          <Field label="Weight" value={an.fontWeight} min={100} max={900} step={100} onChange={(v) => onPatch({ fontWeight: v })} />
        </Row>
        <Row><SegAlign value={an.align} onChange={(v) => onPatch({ align: v })} /></Row>
        <ColorRow label="Color" value={an.color} onChange={(c) => onPatch({ color: c })} />
      </Group>
      <Group title="Background">
        <ColorRow label="Fill" value={an.bg === "transparent" ? "#FFFFFF" : an.bg} onChange={(c) => onPatch({ bg: c })} />
        {an.bg !== "transparent" && <SliderRow label="Bg opacity" value={Math.round((an.bgOpacity ?? 1) * 100)} min={10} max={100} onChange={(v) => onPatch({ bgOpacity: v / 100 })} />}
        <Row><Field label="Padding" value={an.padding} min={0} max={60} onChange={(v) => onPatch({ padding: v })} /><Field label="Radius" value={an.radius} min={0} max={40} onChange={(v) => onPatch({ radius: v })} /></Row>
      </Group>
    </>
  )
}

function NumP({ an, onPatch, tab }) {
  if (tab === "arrange") {
    return <Group title="Position"><Row><Field label="X" value={an.x} onChange={(v) => onPatch({ x: v })} /><Field label="Y" value={an.y} onChange={(v) => onPatch({ y: v })} /></Row></Group>
  }
  return (
    <Group title={`Number ${an.n}`}>
      <Row><Field label="Number" value={an.n} min={0} max={999} onChange={(v) => onPatch({ n: v })} /><Field label="Size" value={an.r} min={8} max={160} onChange={(v) => onPatch({ r: v })} /></Row>
      <ColorRow label="Fill" value={an.fill} onChange={(c) => onPatch({ fill: c })} />
      <ColorRow label="Text color" value={an.color} onChange={(c) => onPatch({ color: c })} />
      <ColorRow label="Border" value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
    </Group>
  )
}

function PenP({ an, onPatch, tab }) {
  if (tab === "arrange") return <Group title="Position"><div style={{ fontSize: 12, color: "#555" }}>Drag on canvas to move.</div></Group>
  return (
    <Group title="Pen">
      <ColorRow label="Color" value={an.stroke} onChange={(c) => onPatch({ stroke: c })} />
      <SliderRow label="Width" value={an.strokeWidth} min={1} max={40} onChange={(v) => onPatch({ strokeWidth: v })} />
    </Group>
  )
}
```

- [ ] **Step 5: Update the top-of-file type import to include `ImageAnn`**

panels.tsx:1:

```tsx
import type { Ann, BoxAnn, CalloutAnn, ImageAnn, LineAnn, NumberAnn, PenAnn, TextAnn, Page } from "./types"
```

- [ ] **Step 6: Handle the three new `onLayers` actions (`"lock"`, `"front"`, `"back"`) — wired in Task 10**

This task only emits the calls (`onLayers(id, "lock")`, `onLayers(id, "front")`, `onLayers(id, "back")`); `editor.tsx`'s `onLayers` handler (currently only handling `"toggle" | "up" | "down" | "delete" | "select"`) gains these three cases in Task 10, Step 4.

- [ ] **Step 7: Manual verification**

Run `npx --yes @palettelab/cli@latest dev`. This component won't compile cleanly until Task 10 updates `editor.tsx`'s `tabs` state to `"style" | "arrange"` and passes the two new props — expect a TypeScript/prop mismatch until Task 10 lands. Confirm at least that `panels.tsx` itself has no syntax errors by checking `npx --yes @palettelab/cli@latest build` doesn't fail on a parse error (a prop-type mismatch across files won't be caught by `build`, only by actually loading the page in Task 10's verification).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/panels.tsx
git commit -m "feat: split Properties panel into Style/Arrange tabs, add fill/dash/actions controls, fix an/ann bug"
```

---

### Task 8: `sidebar.tsx` — Pages + Layers left column

**Files:**
- Create: `frontend/src/sidebar.tsx`

**Interfaces:**
- Consumes: `LayersPanel` (exported from `panels.tsx`, unchanged internally — it already takes `{ page, sel, onSel, onLayers, onDup }`), `Project`/`Page` types.
- Produces: `PagesLayersColumn` component — consumed by Task 10.
- Note: `LayersPanel` in `panels.tsx` is currently a non-exported function (panels.tsx:155). Task 10's Step 1 must add `export` to it as part of wiring this in (call out explicitly there so it isn't missed).

- [ ] **Step 1: Create `frontend/src/sidebar.tsx`**

```tsx
import { useRef } from "react"
import type { Project } from "./types"
import { LayersPanel } from "./panels"
import { I } from "./icons"
import { readImageFile } from "./files"

interface Props {
  proj: Project
  onSwitch: (i: number) => void
  onAdd: (dataUrl: string, name: string, w: number, h: number) => void
  onRemove: (i: number) => void
  sel: string[]
  onSel: (id: string, mult?: boolean) => void
  onLayers: (id: string, action: string) => void
  onDup: (id: string) => void
}

export default function PagesLayersColumn({ proj, onSwitch, onAdd, onRemove, sel, onSel, onLayers, onDup }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const page = proj.pages[proj.activePage]

  const onFile = (f: File | undefined) => {
    if (!f) return
    readImageFile(f, (dataUrl, w, h, name) => onAdd(dataUrl, name, w, h))
  }

  return (
    <aside style={{ width: 220, minWidth: 220, background: "#FFFFFF", borderRight: "1px solid #E5E5E5", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid #EEEEEE" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".5px" }}>Pages</span>
        <button onClick={() => fileRef.current?.click()} title="Add page" style={{ border: "none", background: "none", cursor: "pointer", color: "#2563EB" }}>{I.plus}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />
      </div>
      <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 6 }}>
        {proj.pages.map((pg, i) => (
          <div key={pg.id} onClick={() => onSwitch(i)}
            style={{ display: "flex", gap: 8, alignItems: "center", padding: 6, borderRadius: 8, cursor: "pointer", background: i === proj.activePage ? "#EFF6FF" : "transparent", border: "1px solid " + (i === proj.activePage ? "#BFDBFE" : "transparent") }}>
            <div style={{ width: 40, height: 26, borderRadius: 4, overflow: "hidden", background: "#F0F0EE", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={pg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {pg.title}</div>
              <div style={{ fontSize: 10.5, color: "#999" }}>{pg.w} × {pg.h}</div>
            </div>
            {proj.pages.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); onRemove(i) }} title="Remove page" style={{ border: "none", background: "none", cursor: "pointer", color: "#bbb" }}>{I.close}</button>
            )}
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 8, border: "1px dashed #C9C9C4", background: "#fff", color: "#666", fontSize: 12, cursor: "pointer" }}>
          {I.plus} Add Page
        </button>
      </div>
      <div style={{ borderTop: "1px solid #EEEEEE", flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ padding: "10px 12px 0" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".5px" }}>Layers</span>
        </div>
        <LayersPanel page={page} sel={sel} onSel={onSel} onLayers={onLayers} onDup={onDup} />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Manual verification**

This component has no consumer yet — verified together with Task 10.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/sidebar.tsx
git commit -m "feat: add PagesLayersColumn sidebar component"
```

---

### Task 9: `toppanel.tsx` — canvas-top transform toolbar

**Files:**
- Create: `frontend/src/toppanel.tsx`

**Interfaces:**
- Produces: `CanvasToolbar` component with props `{ hasSel: boolean; locked: boolean; tool: Tool; onCrop: () => void; onRotate: (deg: 90 | -90) => void; onFlip: (axis: "x" | "y") => void; onLock: () => void; onDelete: () => void }` — consumed by Task 10.

- [ ] **Step 1: Create `frontend/src/toppanel.tsx`**

```tsx
import type { Tool } from "./engine"
import { I } from "./icons"

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
  const btn = (active = false) => ({
    width: 32, height: 32, borderRadius: 7, border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? "#EFF6FF" : "transparent", color: active ? "#2563EB" : "#555",
  })
  return (
    <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", alignItems: "center", gap: 2, padding: "4px 6px", background: "#fff", borderRadius: 10, border: "1px solid #E5E5E5", boxShadow: "0 6px 20px rgba(0,0,0,.08)" }}>
      <button title="Crop" style={btn(tool === "crop")} onClick={onCrop}>{I.crop}</button>
      <div style={{ width: 1, height: 20, background: "#E5E5E5", margin: "0 4px" }} />
      <button title="Rotate left" disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4 }} onClick={() => onRotate(-90)}>{I.undo}</button>
      <button title="Rotate right" disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4 }} onClick={() => onRotate(90)}>{I.redo}</button>
      <button title="Flip horizontal" disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4 }} onClick={() => onFlip("x")}>{I.link}</button>
      <button title="Flip vertical" disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4, transform: "rotate(90deg)" }} onClick={() => onFlip("y")}>{I.link}</button>
      <div style={{ width: 1, height: 20, background: "#E5E5E5", margin: "0 4px" }} />
      <button title={locked ? "Unlock" : "Lock"} disabled={!hasSel} style={{ ...btn(locked), opacity: hasSel ? 1 : 0.4 }} onClick={onLock}>{I.link}</button>
      <button title="Delete" disabled={!hasSel} style={{ ...btn(), opacity: hasSel ? 1 : 0.4, color: "#DC2626" }} onClick={onDelete}>{I.trash}</button>
    </div>
  )
}
```

- [ ] **Step 2: Manual verification**

No consumer yet — verified together with Task 10.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/toppanel.tsx
git commit -m "feat: add CanvasToolbar (crop/rotate/flip/lock/delete)"
```

---

### Task 10: `editor.tsx` integration — layout, new tools, background upload

This is the task that wires every previous task together. Work through the steps in order; each one keeps the app in a compiling, runnable state.

**Files:**
- Modify: `frontend/src/editor.tsx` (extensive)
- Modify: `frontend/src/panels.tsx:155` (export `LayersPanel`, one-word change — see Step 1)

**Interfaces:**
- Consumes: `PagesLayersColumn` (Task 8), `CanvasToolbar` (Task 9), `applyCrop` (Task 6), `cropDataUrl`/`blankCanvasDataUrl`/`readImageFile` (Task 2), `preloadAnnImages`/`drawAnn(ctx,a,onImageLoad)` (Task 5), `defaultAnn("image", ...)` (Task 3).
- Produces: fully working redesigned editor.

- [ ] **Step 1: Export `LayersPanel` from `panels.tsx`**

Change `frontend/src/panels.tsx:155` from:

```tsx
function LayersPanel({ page, sel, onSel, onLayers, onDup }) {
```

to:

```tsx
export function LayersPanel({ page, sel, onSel, onLayers, onDup }) {
```

- [ ] **Step 2: Update `editor.tsx`'s imports**

Replace `editor.tsx:1-15` with:

```tsx
import { useCallback, useEffect, useRef, useState } from "react"
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
import { upsertProject } from "./persist"
import { readImageFile, blankCanvasDataUrl, cropDataUrl } from "./files"
import RightPanel from "./panels"
import PagesLayersColumn from "./sidebar"
import CanvasToolbar from "./toppanel"
import ExportModal, { Preview } from "./export"
```

- [ ] **Step 3: Update the `tabs` state type**

Change `editor.tsx:40` from:

```tsx
  const [tabs, setTabs] = useState<"props" | "layers">("props")
```

to:

```tsx
  const [tabs, setTabs] = useState<"style" | "arrange">("style")
  const [cropRect, setCropRect] = useState<B | null>(null)
```

- [ ] **Step 4: Extend the `onLayers` handler with `lock`/`front`/`back`, and support `image` insert / eraser delete**

In the `<RightPanel .../>` JSX (editor.tsx:603-639), the `onLayers` prop currently handles `"toggle" | "up" | "down" | "delete" | "select"`. Add three more branches — replace the whole `onLayers={(id, action) => { ... }}` block with:

```tsx
          onLayers={(id, action) => {
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
          }}
```

- [ ] **Step 5: Add rotate-90 / flip / lock-selection / background upload+clear / crop-apply handlers**

Add these functions right after `dupSel()` (editor.tsx, after line 311, before `commitEdit`):

```tsx
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

  function clearBackground() {
    const before = snap()
    const blank = blankCanvasDataUrl(page.w, page.h)
    setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, dataUrl: blank } : pg)) }))
    pushHist(before)
    setDirty(true)
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

  function insertImageFile(file: File) {
    readImageFile(file, (dataUrl, w, h) => {
      const { s, x, y, cssW, cssH } = layout()
      const vw = cssW / s, vh = cssH / s
      const maxW = Math.min(w, page.w * 0.6)
      const scale = maxW / w
      const iw = w * scale, ih = h * scale
      const ix = Math.max(0, (page.w - iw) / 2)
      const iy = Math.max(0, (page.h - ih) / 2)
      addAnn(defaultAnn("image", { x: ix, y: iy, w: iw, h: ih, dataUrl } as Partial<Ann>))
      setTool("select")
    })
  }
```

- [ ] **Step 6: Wire the Insert Image and Background tools to open a file picker on tool select**

Add a new `useEffect` right after the existing "native wheel" effect (editor.tsx, after line 232, before the "history" section comment):

```tsx
  const pickerRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (tool === "insertImage" || tool === "background") {
      pickerRef.current?.click()
    }
  }, [tool])
```

Add the hidden input once, in the main render's returned JSX, right after the `<canvas ... />` closing (editor.tsx, near line 599, inside the stage `<div>` alongside `{editId && <TextOverlay .../>}`):

```tsx
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
```

- [ ] **Step 7: Add eraser-tool pointer handling**

In `pDown` (editor.tsx:333-396), add a branch right before the `// draw tool` comment (after the `if (tl === "select") { ... }` block ends, i.e. right before line 382's `// draw tool`):

```tsx
    if (tl === "eraser") {
      mode.current = "erase"
      op.current = { start: pt, before: snap(), changed: false }
      eraseAt(pt)
      return
    }
```

Add the `eraseAt` helper right above `pDown` (editor.tsx, just before line 333):

```tsx
  function eraseAt(pt: P) {
    const s = layout().s
    const hit = page.annotations.find((a) => a.visible !== false && hitOne(pt, a, 8 / s))
    if (!hit) return
    setProj((p) => ({ ...p, updatedAt: Date.now(), pages: p.pages.map((pg, i) => (i === p.activePage ? { ...pg, annotations: pg.annotations.filter((x) => x.id !== hit.id) } : pg)) }))
    op.current.changed = true
  }
```

In `pMove` (editor.tsx:398-464), add a branch right after the `if (m === "pan") { ... }` block (after line 403):

```tsx
    if (m === "erase") { eraseAt(pt); return }
```

In `pUp` (editor.tsx:466-482), the existing line `if (m && m !== "draw" && m !== "marquee" && o.changed && o.before) pushHist(o.before)` already covers `"erase"` (it's not `"draw"` or `"marquee"`), so no change needed there — confirm this by reading that line, don't duplicate the history push.

- [ ] **Step 8: Add crop-tool pointer handling**

In `pDown`, add a branch for `tl === "crop"` right after the eraser branch added in Step 7:

```tsx
    if (tl === "crop") {
      mode.current = "cropdraw"
      op.current = { start: pt }
      setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 })
      return
    }
```

In `pMove`, add right after the `"erase"` branch added in Step 7:

```tsx
    if (m === "cropdraw") {
      const s0 = o.start!
      setCropRect({ x: Math.min(s0.x, pt.x), y: Math.min(s0.y, pt.y), w: Math.abs(pt.x - s0.x), h: Math.abs(pt.y - s0.y) })
      return
    }
```

In `pUp`, add right after the existing `if (m === "marquee" && marquee) { ... }` block (after line 476):

```tsx
    if (m === "cropdraw") {
      // cropRect stays set; user confirms via the Crop button in CanvasToolbar (applyCropNow) or cancels with Escape.
    }
```

Add crop-rect drawing to `redraw()` — right after the existing `if (marquee) { ... }` block (editor.tsx:123-129):

```tsx
    if (cropRect) {
      ctx.save()
      ctx.strokeStyle = "#2563EB"
      ctx.lineWidth = 2 / s
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.restore()
    }
```

Add `cropRect` to `redraw`'s `useCallback` dependency array (editor.tsx:130, currently `[sel, zoom, pan, marquee]`) and to the `useEffect` that calls it (editor.tsx:184, currently `[proj, sel, zoom, pan, marquee, editText]`):

```tsx
  }, [sel, zoom, pan, marquee, cropRect])
```

```tsx
  useEffect(() => { redraw() }, [proj, sel, zoom, pan, marquee, editText, cropRect])
```

Handle Escape canceling an in-progress crop — in the keyboard `useEffect` (editor.tsx:512-542), add a check at the top of the `Escape` branch (currently starting at line 525):

```tsx
      if (e.key === "Escape") {
        if (cropRect) { setCropRect(null); setTool("select"); return }
        if (editId) { commitEdit(); return }
```

- [ ] **Step 9: Skip interaction for locked annotations on canvas**

In `pDown`'s `"select"` branch, the line that finds a hit (editor.tsx:371) currently reads:

```tsx
      const hit = [...page.annotations].reverse().find((a) => a.visible !== false && hitOne(pt, a, 5 / s))
```

Change it to also skip locked annotations for direct canvas interaction (they remain selectable via the Layers list, which calls `onSel` directly, bypassing this code path entirely):

```tsx
      const hit = [...page.annotations].reverse().find((a) => a.visible !== false && !a.locked && hitOne(pt, a, 5 / s))
```

Also guard the earlier single-selection resize/rotate/tail/endpoint handle checks (editor.tsx:349-370, the `if (one && one.visible !== false) { ... }` block) — change its condition to:

```tsx
      const one = sel.length === 1 ? page.annotations.find((a) => a.id === sel[0]) : null
      if (one && one.visible !== false && !one.locked) {
```

- [ ] **Step 10: Update `redraw()`'s `drawAnn` calls to pass the image-load callback**

Two call sites need the third argument. First, editor.tsx:108:

```tsx
    for (const a of pg.annotations) if (a.visible !== false) drawAnn(ctx, a, redraw)
```

Second, editor.tsx:109 (the in-progress draw draft never needs the callback since drafts are never `"image"` type — created only via file picker, not drag — leave this one as `drawAnn(ctx, op.current.shape)` unchanged).

- [ ] **Step 11: Preload annotation images before the export/preview render**

`ExportModal` and `Preview` (both in `export.tsx`) call `renderPageCanvas`, which draws each page's annotations synchronously inside the background image's `onload`. Update `renderPageCanvas` in `frontend/src/export.tsx` (currently lines 10-27) to await image annotations first:

```tsx
import { drawAnn, preloadAnnImages } from "./draw"

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
```

This changes `renderPageCanvas` from sync to `async`. Update its four call sites in `export.tsx` (`doExport`'s PDF branch, `doExport`'s raster branch, and `Preview`'s two calls) to `await renderPageCanvas(...)` instead of a bare call — e.g. `const cv = await renderPageCanvas(pg, s1, bg)` (already `await`ed via the surrounding `ready(cv)` pattern in the PDF/raster branches, so just add `await` before the `renderPageCanvas(...)` call itself); in `Preview`'s `useEffect` and `doDownload`, wrap in an async IIFE since neither is currently `async`:

```tsx
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
```

Also update `frontend/src/persist.ts`'s `renderPage` (currently a sync function drawing the thumbnail) — since thumbnails are a nice-to-have and not exported output, leave `renderPage` as-is (image annotations may be momentarily missing from the Home-screen thumbnail on the very first render after adding one, self-correcting on the next `annotator:thumb` dispatch triggered by any later edit); note this explicitly as an accepted limitation rather than silently doing nothing — do not spend extra time threading async through `persist.ts`'s thumbnail path.

- [ ] **Step 12: Rebuild the left side of the layout and add `CanvasToolbar`**

Replace the render's flex row (editor.tsx:588-640, from `<div style={{ flex: 1, display: "flex", minHeight: 0 }}>` through the `<RightPanel .../>` closing) — keep `ToolbarBar` and `RightPanel` exactly as they are wired today, just insert `PagesLayersColumn` after `ToolbarBar` and `CanvasToolbar` inside the stage `<div>`:

```tsx
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ToolbarBar tool={tool} setTool={setTool} color={color} setColor={setColor} sw={sw} setSw={setSw} />
        <PagesLayersColumn
          proj={proj}
          onSwitch={switchPage}
          onAdd={addImage}
          onRemove={removePage}
          sel={sel}
          onSel={(id, mult) => setSel((cur) => (mult ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]))}
          onLayers={(id, action) => rightPanelOnLayers(id, action)}
          onDup={(id) => dupAnnById(id)}
        />
        <div ref={stageRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: "#E6E6E3", touchAction: "none" }}>
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
            <button onClick={applyCropNow} style={{ position: "absolute", top: 10, right: 10, zIndex: 10, padding: "8px 16px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Apply Crop
            </button>
          )}
          <div style={{ position: "absolute", left: lr.x, top: lr.y, width: lr.cssW, height: lr.cssH, boxShadow: "0 20px 60px rgba(0,0,0,.25), 0 4px 14px rgba(0,0,0,.15)" }}>
            <canvas
              ref={cvRef}
              style={{ width: "100%", height: "100%", display: "block", cursor: tool === "select" ? (spaceDown.current ? "grabbing" : "default") : "crosshair", touchAction: "none" }}
              onPointerDown={pDown}
              onPointerMove={pMove}
              onPointerUp={pUp}
              onPointerCancel={pUp}
            />
            {editId && <TextOverlay page={page} annId={editId} value={editText} setValue={setEditText} onDone={commitEdit} />}
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
          </div>
        </div>
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
          onDup={(id) => dupAnnById(id)}
        />
      </div>
```

This references two small helpers that don't exist yet as named functions (the plan avoids repeating the same inline arrow function twice, once for `PagesLayersColumn` and once for `RightPanel`, since both now need identical `onLayers`/`onDup` behavior). Add them right after the `onLayers` handler edited in Step 4 (i.e., extract that same logic — this is the one place in the plan where a step says "move," not "duplicate"): rename the inline `onLayers={(id, action) => { ... }}` function from Step 4 into a standalone function `function rightPanelOnLayers(id: string, action: string) { ...same body... }` declared in the component body (near `dupSel`/`removeSel`), and likewise extract the existing `onDup` inline handler (editor.tsx:638, `onDup={(id) => { const before = snap(); ... }}`) into `function dupAnnById(id: string) { ...same body... }`. Both `PagesLayersColumn` and `RightPanel` then reference these two named functions instead of two separate inline closures.

- [ ] **Step 13: Add the footer drag-drop card and Upload/Clear Background buttons**

Replace `BottomBar` (editor.tsx:715-756) with a version that adds the new controls after the existing zoom controls:

```tsx
function BottomBar({ proj, zoom, onZoom, onFit, onSwitch, onAdd, onRemove, onDup, onUploadBg, onClearBg }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const bgRef = useRef<HTMLInputElement>(null)
  const chip = { padding: "5px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "1px solid #E5E5E5", background: "#fff", color: "#333" }

  const addFiles = (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue
      const rd = new FileReader()
      rd.onload = () => {
        const img = new Image()
        img.onload = () => onAdd(String(rd.result), f.name, img.width, img.height)
        img.src = String(rd.result)
      }
      rd.readAsDataURL(f)
    }
  }

  return (
    <footer style={{ height: 42, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 12px", background: "#FFFFFF", borderTop: "1px solid #E5E5E5" }}>
      <span style={{ fontSize: 12, color: "#666" }}>{proj.pages[proj.activePage]?.w}×{proj.pages[proj.activePage]?.h}px</span>
      <span style={{ fontSize: 12, color: "#999" }}>·</span>
      <span style={{ fontSize: 12, color: "#666" }}>{proj.pages[proj.activePage]?.annotations.length || 0} objects</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 7, border: drag ? "1.5px dashed #2563EB" : "1.5px dashed #C9C9C4", background: drag ? "#EFF6FF" : "#FAFAF9", fontSize: 11.5, color: "#666", cursor: "pointer" }}
        title="Drag & drop image here or click to upload"
      >
        {I.upload} Drag &amp; drop or upload
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = "" }} />
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5, overflowX: "auto" }}>
        {proj.pages.map((pg, i) => (
          <div key={pg.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 6px", borderRadius: 7, background: i === proj.activePage ? "#EFF6FF" : "transparent", border: "1px solid " + (i === proj.activePage ? "#BFDBFE" : "transparent"), cursor: "pointer", fontSize: 12 }}
            onClick={() => onSwitch(i)} title={pg.title}>
            <span style={{ fontWeight: 700, color: i === proj.activePage ? "#2563EB" : "#555" }}>{i + 1}</span>
            <span style={{ color: "#666", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg.title}</span>
            {proj.pages.length > 1 && (
              <span onClick={(e) => { e.stopPropagation(); onRemove(i) }} title="Remove page" style={{ color: "#999", marginLeft: 2, cursor: "pointer" }}>×</span>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => fileRef.current?.click()} title="Add image" style={chip}>{I.plus} Image</button>
      <div style={{ width: 1, height: 20, background: "#E5E5E5" }} />
      <button onClick={() => bgRef.current?.click()} title="Upload Background" style={chip}>{I.background} Upload Background</button>
      <input ref={bgRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadBg(f); e.target.value = "" }} />
      <button onClick={onClearBg} title="Clear Background" style={chip}>{I.close} Clear Background</button>
      <div style={{ width: 1, height: 20, background: "#E5E5E5" }} />
      <button onClick={() => onZoom(Math.max(0.05, zoom / 1.2))} title="Zoom out" style={chip}>{I.zoomOut}</button>
      <button onClick={onFit} title="Fit to screen" style={{ ...chip, fontWeight: 700 }}>{Math.round(zoom * 100)}%</button>
      <button onClick={() => onZoom(Math.min(5, zoom * 1.2))} title="Zoom in" style={chip}>{I.zoomIn}</button>
    </footer>
  )
}
```

Update its call site (editor.tsx:641-650):

```tsx
      <BottomBar
        proj={proj}
        zoom={zoom}
        onZoom={setZoom}
        onFit={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
        onSwitch={switchPage}
        onAdd={addImage}
        onRemove={removePage}
        onDup={dupPage}
        onUploadBg={uploadBackground}
        onClearBg={clearBackground}
      />
```

- [ ] **Step 14: Remove the two dead no-op stubs at the bottom of the file**

`editor.tsx:808-814` currently has:

```tsx
function stageOf(page) {
  return page ? {} : null
}

function SelectTool() { return null }

function Home() { return null }
```

`stageOf` is used by `TextOverlay` (editor.tsx:760, `const st = stageOf(page)`) purely as a truthiness check — leave `stageOf` and its call in `TextOverlay` untouched (out of scope; not part of this feature). Delete only the two genuinely dead exports, `SelectTool` and `Home` (they're never referenced anywhere in the codebase):

```tsx
function SelectTool() { return null }

function Home() { return null }
```

→ delete both.

- [ ] **Step 15: Manual verification — full walkthrough**

Run `npx --yes @palettelab/cli@latest dev`, open the preview URL, and work through every item:

1. Upload a screenshot from Home → editor opens with the new two-column left sidebar (Tools rail + Pages/Layers column) and the canvas-top toolbar visible.
2. Draw a rectangle → Style tab (right panel) shows Stroke/Stroke Style/Fill/Opacity; Arrange tab shows Position/Size/Rotation. Toggle stroke style dashed/dotted — canvas updates immediately.
3. Select the rectangle, click Rotate Right in the canvas-top toolbar twice → rotation increases by 180° total (check the Arrange tab's Rotation field reflects it).
4. Click Flip Horizontal → no crash (visually a no-op for a plain rectangle, expected — flip is meaningful for images).
5. Click Lock in the canvas-top toolbar → try to drag the rectangle on canvas: it must not move. Open the Layers panel (left column) → the rectangle is still listed and its eye/duplicate/delete buttons still work.
6. Select Eraser tool, drag across an annotation → it's deleted; press Cmd/Ctrl+Z → it comes back.
7. Select Insert Image tool → file picker opens immediately; choose an image → a new resizable/movable image annotation appears centered on the page.
8. Select Crop tool, drag a rectangle smaller than the page, click "Apply Crop" → page dimensions shrink to match, any annotation fully outside the cropped area is gone, remaining ones shift correctly. Undo restores the pre-crop page.
9. In the footer, drag an image file onto the "Drag & drop or upload" card → a new page is added and the view switches to it.
10. Click "Upload Background" in the footer, pick an image → the current page's background image is replaced; existing annotations on that page are untouched.
11. Click "Clear Background" → the page becomes blank (white) while keeping its annotations.
12. Export → PNG and PDF both succeed with an image-type annotation present in the page.
13. Return Home → the project's thumbnail and name reflect the latest edits (regression check for Task 1).

- [ ] **Step 16: Commit**

```bash
git add frontend/src/editor.tsx frontend/src/export.tsx frontend/src/panels.tsx
git commit -m "feat: integrate redesigned layout, new tools, and background upload into the editor"
```

---

## Plan Self-Review Notes

- **Spec coverage:** A (bugs) → Task 1 + Task 7 Step 1. B (tools) → Tasks 3, 4, 5, 10. C (sidebar) → Task 8, wired in Task 10. D (canvas-top toolbar) → Task 9, wired in Task 10. E (Style/Arrange panel) → Task 7. F (footer upload) → Task 10 Step 13. All six spec sections have a task.
- **Type consistency checked:** `applyCrop(page, rect)` (Task 6) is called as `applyCrop(page, cropRect)` in Task 10 Step 5 — same two-arg shape, `B` type imported into `editor.tsx` in Step 2. `drawAnn(ctx, a, onImageLoad?)` (Task 5) is called with the third arg only where an image might be pending (Task 10 Step 10); export's synchronous per-page draw (Task 10 Step 11) intentionally omits it since `preloadAnnImages` already guarantees a cache hit by then. `RightPanel`'s `tab` prop type (`"style" | "arrange"`, Task 7) matches the `tabs` state type introduced in Task 10 Step 3. `onLayers` action strings (`"toggle" | "lock" | "up" | "down" | "front" | "back" | "delete" | "select"`) are consistent between the Task 7 Style-panel `ActionsRow` emitter and the Task 10 Step 4 handler.
- **No placeholders:** every step above has literal code, not prose descriptions of code.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-09-editor-redesign-upload.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
