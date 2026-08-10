import { I } from "./icons"

export type Tool = "select" | "rect" | "rrect" | "ellipse" | "line" | "arrow" | "text" | "number" | "pen" | "highlight" | "blur" | "pixelate" | "callout" | "eraser" | "crop" | "insertImage" | "background" | "textEdit"

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
  { t: "textEdit", label: "Edit Screenshot Text", icon: I.ocrScan },
]

export const TOOL_KEY: Record<string, Tool> = {
  v: "select", r: "rect", a: "arrow", t: "text", c: "ellipse", b: "blur", h: "highlight", n: "number", l: "line", p: "pen", x: "pixelate", k: "callout", e: "eraser", o: "crop",
}

export function isBoxTool(t: Tool): boolean {
  return ["rect", "rrect", "ellipse", "highlight", "blur", "pixelate", "callout"].includes(t)
}
export function isLineTool(t: Tool): boolean {
  return t === "line" || t === "arrow"
}

export const TYPE_NAME: Record<string, string> = {
  rect: "Rectangle", rrect: "Rounded rect", ellipse: "Ellipse", line: "Line", arrow: "Arrow", text: "Text",
  number: "Number", pen: "Pen", highlight: "Highlight", blur: "Blur", pixelate: "Pixelate", callout: "Callout", image: "Image",
}
export function typeName(t: string): string {
  return TYPE_NAME[t] || t
}

export const SWATCHES = ["#EF4444", "#F97316", "#FACC15", "#22C55E", "#3B82F6", "#A855F7", "#7C2D3B", "#FFFFFF"]
