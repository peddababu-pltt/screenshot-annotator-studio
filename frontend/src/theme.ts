import { usePlatform } from "@palettelab/sdk"

export interface Theme {
  mode: "light" | "dark"
  bg: string
  surface: string
  surfaceAlt: string
  border: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentSoft: string
  accentBorder: string
  danger: string
  success: string
  shadow: string
  shadowLg: string
  shell: ShellPalette
}

/**
 * Monochrome slate palette used by the home shell (sidebar, top bar, cards,
 * upload zone). Kept separate from the editor tokens above so recolouring the
 * shell never shifts the editor's accent colours.
 */
export interface ShellPalette {
  navBg: string
  navGlow: string
  navText: string
  navTextMuted: string
  navActiveBg: string
  navActiveBorder: string
  navBorder: string
  pageBg: string
  surface: string
  surfaceAlt: string
  border: string
  borderDashed: string
  text: string
  textMuted: string
  textFaint: string
  ink: string
  inkTile: string
  fieldBg: string
  btn: string
  btnHover: string
  circle: string
  rule: string
  shadow: string
  /** Editor chrome */
  well: string
  headerBg: string
  iconBtn: string
  btnDark: string
  btnDarkHover: string
  railCaption: string
  cardShadow: string
}

const LIGHT_SHELL: ShellPalette = {
  navBg: "linear-gradient(165deg, #191D22 0%, #131619 45%, #0D1013 100%)",
  navGlow: "radial-gradient(120% 60% at 15% 100%, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 70%)",
  navText: "#F8F8F9",
  navTextMuted: "#9BA2AC",
  navActiveBg: "linear-gradient(180deg, #343942 0%, #23272D 100%)",
  navActiveBorder: "rgba(255,255,255,.10)",
  navBorder: "rgba(255,255,255,.07)",
  pageBg: "#F3F4F5",
  surface: "#F8F9FA",
  surfaceAlt: "#EFF0F2",
  border: "#E4E6EA",
  borderDashed: "#CECFD5",
  text: "#14171A",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",
  ink: "#252B31",
  inkTile: "#EFF0F2",
  fieldBg: "#E8E9ED",
  btn: "linear-gradient(180deg, #868E9A 0%, #6A727E 100%)",
  btnHover: "linear-gradient(180deg, #929AA6 0%, #747C88 100%)",
  circle: "linear-gradient(180deg, #6E7681 0%, #565E69 100%)",
  rule: "#6D747E",
  shadow: "0 8px 24px rgba(16,20,26,.08)",
  well: "#DFE3E9",
  headerBg: "#FAFCFC",
  iconBtn: "#EFF0F2",
  btnDark: "linear-gradient(180deg, #3A4553 0%, #263240 100%)",
  btnDarkHover: "linear-gradient(180deg, #46525F 0%, #313D4B 100%)",
  railCaption: "#5B6779",
  cardShadow: "0 1px 2px rgba(16,20,26,.05), 0 8px 24px rgba(16,20,26,.06)",
}

const DARK_SHELL: ShellPalette = {
  navBg: "linear-gradient(165deg, #14171B 0%, #0F1215 45%, #090B0D 100%)",
  navGlow: "radial-gradient(120% 60% at 15% 100%, rgba(255,255,255,.05) 0%, rgba(255,255,255,0) 70%)",
  navText: "#F1F2F3",
  navTextMuted: "#868D96",
  navActiveBg: "linear-gradient(180deg, #2B3138 0%, #1C2025 100%)",
  navActiveBorder: "rgba(255,255,255,.09)",
  navBorder: "rgba(255,255,255,.06)",
  pageBg: "#0F1113",
  surface: "#171A1D",
  surfaceAlt: "#1F2327",
  border: "#2A2E33",
  borderDashed: "#343940",
  text: "#EDEEEF",
  textMuted: "#9AA1A9",
  textFaint: "#6D747C",
  ink: "#E7E9EB",
  inkTile: "#22262A",
  fieldBg: "#1D2125",
  btn: "linear-gradient(180deg, #5C646F 0%, #444B55 100%)",
  btnHover: "linear-gradient(180deg, #68707B 0%, #4E5560 100%)",
  circle: "linear-gradient(180deg, #4E555F 0%, #383E47 100%)",
  rule: "#7A828C",
  shadow: "0 8px 24px rgba(0,0,0,.45)",
  well: "#0A0C0E",
  headerBg: "#141719",
  iconBtn: "#22262A",
  btnDark: "linear-gradient(180deg, #3A4553 0%, #263240 100%)",
  btnDarkHover: "linear-gradient(180deg, #46525F 0%, #313D4B 100%)",
  railCaption: "#6B7686",
  cardShadow: "0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35)",
}

const LIGHT: Theme = {
  mode: "light",
  bg: "#F4F5F7",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F2F6",
  border: "#E2E4E9",
  text: "#111827",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",
  accent: "#2B67F9",
  accentSoft: "#EBEFF8",
  accentBorder: "#C7D8F8",
  danger: "#DC2626",
  success: "#16A34A",
  shadow: "0 10px 30px rgba(0,0,0,.10)",
  shadowLg: "0 20px 60px rgba(0,0,0,.20), 0 4px 14px rgba(0,0,0,.12)",
  shell: LIGHT_SHELL,
}

const DARK: Theme = {
  mode: "dark",
  bg: "#0F1117",
  surface: "#1A1D2B",
  surfaceAlt: "#232640",
  border: "#2E3354",
  text: "#F1F1F1",
  textMuted: "#9CA3AF",
  textFaint: "#6B7280",
  accent: "#5B90FF",
  accentSoft: "#10203A",
  accentBorder: "#23457F",
  danger: "#F87171",
  success: "#4ADE80",
  shadow: "0 10px 30px rgba(0,0,0,.45)",
  shadowLg: "0 20px 60px rgba(0,0,0,.6), 0 4px 14px rgba(0,0,0,.4)",
  shell: DARK_SHELL,
}

export function useTheme(): Theme {
  const { colorMode } = usePlatform()
  return colorMode === "dark" ? DARK : LIGHT
}
