# Editor Redesign + Upload/Background — Design Spec

Date: 2026-08-09
Status: Approved by user, pending implementation plan

## Context

The annotator app (Palette plugin, `@palettelab/sdk` frontend + `palette_sdk`
backend) already has a working single-page editor: upload → annotate → export.
A target UI mockup (`ChatGPT Image Aug 9, 2026, 09_13_58 AM.png`) shows a more
elaborate editor layout with a dedicated Pages+Layers left column, a
canvas-top transform toolbar, a richer Properties panel, and explicit
background upload/replace affordances. This spec covers bringing the app up
to that target, plus fixing three pre-existing bugs discovered during review
that block functionality the mockup depends on.

## A. Bug fixes

These are unrelated to the layout work but block features the redesign
relies on, so they're fixed first:

1. `frontend/src/panels.tsx` — `ObjectProps` destructures `{ ann, onPatch }`
   but its `switch` and all the `<XxxP an={an} .../>` calls reference `an`,
   which is undefined in scope. Selecting any single annotation throws and
   the Style panel never renders. Fix: use `ann` consistently (or destructure
   as `an`).
2. `frontend/src/index.tsx` passes `onChange={saveProject}` to `<Editor>`,
   but `Editor`'s props type declares `onProject`. Every autosave/`saveNow()`
   call therefore calls `undefined(p)` and throws, so `Home`'s project list
   and thumbnails never refresh after edits. Fix: rename the prop consistently
   (`onProject` everywhere, since that's what `Editor` already uses
   internally).
3. `frontend/src/export.tsx` — `pdfScale1` is referenced when computing PDF
   image placement but never declared. Every PDF export throws. Fix: replace
   with the already-computed `pdfScale(pg)` (or hoist a `const s1 =
   pdfScale(pg)` and reuse it for both the render scale and the placement
   math, since the same value is needed twice).

## B. New tool types

Add to `AnnType`/`Node`/`Tool` unions:

- **`eraser`** — drag across the canvas; any annotation whose bounds the
  cursor passes over (5px hit radius, same as existing `hitOne`) is deleted
  immediately (one history entry per stroke, not per deleted object). This
  is a "delete brush", not pixel-level raster erasing — matches existing
  precedent in the codebase (no raster layer to erase into) and is the
  standard behavior in comparable annotation tools.
- **`crop`** — selecting the tool shows a draggable/resizable rect
  constrained to the page bounds, seeded to the full image. A "Crop" button
  in the canvas-top toolbar (or Enter key) applies it: renders the cropped
  region to a new `dataUrl`, updates `page.w`/`page.h`, and re-maps every
  annotation's coordinates by subtracting the crop origin. Annotations fully
  outside the crop rect are dropped; partially-outside ones are kept as-is
  (clipping their visuals is already handled by canvas draw bounds). Escape
  cancels without changes.
- **`insertImage`** — opens a file picker immediately on tool select; the
  chosen image becomes a new `image`-type annotation (see below), centered
  on the current viewport, movable/resizable/rotatable like a box annotation.
- **`background`** — not a drawing tool; a rail button that immediately opens
  the same file picker as the footer's "Upload Background" action (see F).
  Tool state is not changed when clicked.

New `Ann` variant:

```ts
interface ImageAnn extends AnnBase {
  type: "image"
  x: number; y: number; w: number; h: number
  dataUrl: string
  locked?: boolean
}
```

`isBoxAnn`/resize/move/rotate logic already operates generically on
`{x,y,w,h}` — `image` slots into the existing box-annotation code paths in
`engine.ts`/`draw.ts` with an added draw case that draws the embedded image
instead of a stroke/fill.

## C. Left sidebar: two columns

Split the current single `ToolbarBar` region into:

1. **Tools rail** (existing icon column, ~62px) — unchanged in mechanics,
   gains labels next to icons per the mockup, plus the eraser/crop/insert
   image/background entries from section B.
2. **Pages + Layers column** (new, ~220px, between tools rail and canvas):
   - "Pages" header with a `+` (add page) button.
   - Page list: thumbnail + title + dimensions, click to switch, hover to
     delete (same data/actions `BottomBar` already exposes via
     `onSwitch`/`onAdd`/`onRemove`/`onDup` — moved up, not duplicated logic).
   - "Layers" header + the existing `LayersPanel` (currently a tab inside
     `RightPanel`), operating on the active page's annotations.

`RightPanel`'s `layers` tab is removed since Layers lives in the new column
now; `RightPanel` becomes Properties-only (see E).

## D. Canvas-top toolbar

A new toolbar row above the canvas (inside the stage area, not the page
header) with: Crop, Rotate Left (-90°), Rotate Right (+90°), Flip
Horizontal, Flip Vertical, Lock, Delete. These act on the current selection
(single or multi where it makes sense — rotate/flip/lock/delete apply to
each selected annotation; Crop always targets the background image and
requires nothing selected).

Requires new `AnnBase` fields:
- `locked?: boolean` — when true, `pDown`'s hit-testing skips move/resize/
  rotate for that annotation on canvas (still visible, still selectable from
  the Layers list, still toggleable via the Lock button/Actions row).
- `flipX?: boolean` / `flipY?: boolean` — for box-shaped and image
  annotations; `draw.ts` applies a negative scale transform per flip flag.

Rotate Left/Right just adjust `rotation` by ∓90 (mod 360); no new engine
logic needed beyond what `updSel`/`updAnn` already provide.

## E. Right panel: Properties only, Style/Arrange tabs

`RightPanel` keeps its two-tab shell but the tabs become **Style** (current
`PropsPanel` content, extended) and **Arrange** (position/size/rotate/layer
order — largely a re-split of fields already in `PropsPanel`, not new
functionality). Additions to Style:

- **Stroke style** (solid/dashed/dotted) via a new `dash?: "solid" |
  "dashed" | "dotted"` field on stroke-bearing anns; `draw.ts` calls
  `ctx.setLineDash(...)` accordingly (`[]` / `[8,5]` / `[2,4]`, scaled by
  `strokeWidth`).
- **Fill swatch** — box annotations already carry `fill`/`fillOpacity` in
  data but `BoxP` never rendered a control for it. Adding the `ColorRow` +
  transparent toggle that was simply missing.
- **Actions row** — duplicate, lock toggle, visibility toggle, delete, and a
  "more" menu (Bring to Front / Send to Back, using the existing `onLayers`
  up/down repeated to the array bounds). These call handlers `RightPanel`
  already receives (`onDup`, `onLayers`, `onPatch`) — no new plumbing beyond
  wiring `locked`.

## F. Footer: background upload

- Keep the existing page-chip strip and zoom controls.
- Add a persistent drag-and-drop card ("Drag & drop image here or click to
  upload") that adds a new page — same effect as the existing "+ Add Page"/
  "+ Image" control, just with a larger, more discoverable drop target,
  matching the mockup's placement near the page strip.
- Add **Upload Background** (opens a file picker; replaces the *active
  page's* `dataUrl`/`w`/`h` in place, keeping its existing annotations and
  id) and **Clear Background** (sets the active page's `dataUrl` to a blank
  white canvas of the same dimensions, keeping annotations). Both push one
  undo history entry.

## Data flow / error handling

- All new mutations (crop, flip, lock, background replace/clear, eraser
  deletes) go through the existing `snap()`/`pushHist()`/`setDirty(true)`
  pattern already used for every other edit, so undo/redo and autosave keep
  working unchanged.
- File reads reuse `readImageFile`/the inline `FileReader` pattern already
  present in `home.tsx`/`editor.tsx` — no new upload plumbing needed, no
  change to the Palette SDK/CLI usage (backend stays untouched; storage
  stays client-side `localStorage` via `persist.ts`, unaffected by this
  spec).
- Crop/background-replace clamp to sane bounds (min 1×1) and no-op silently
  if the resulting rect is degenerate, rather than throwing.

## Out of scope

- Pixel-exact spacing/sizing match to the mockup image — structure, grouping,
  and icon/label choices follow it closely; exact offsets are implementation
  judgment.
- Any backend/API change — `capabilities.file_uploads` in
  `palette-plugin.json` stays `false`; uploads remain client-side only, as
  today.
- Multi-select behavior for Crop (only ever targets the background image).

## Testing

- Manual pass in-browser (dev server) for: select a shape → Style panel
  renders (regression check for bug A.1); edit → Home thumbnails refresh
  (A.2); PDF export completes (A.3); each new tool (eraser, crop, insert
  image, background) exercised once; Upload/Clear Background; undo/redo
  after each new mutation type; export still works with `image`-type
  annotations and flipped/locked annotations present.
