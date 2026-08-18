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
  accent: "#5956D6",
  accentSoft: "#EEF2FF",
  accentBorder: "#C7D2FE",
  danger: "#DC2626",
  success: "#16A34A",
  shadow: "0 10px 30px rgba(0,0,0,.10)",
  shadowLg: "0 20px 60px rgba(0,0,0,.20), 0 4px 14px rgba(0,0,0,.12)",
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
  accent: "#6366F1",
  accentSoft: "#1E1B4B",
  accentBorder: "#3730A3",
  danger: "#F87171",
  success: "#4ADE80",
  shadow: "0 10px 30px rgba(0,0,0,.45)",
  shadowLg: "0 20px 60px rgba(0,0,0,.6), 0 4px 14px rgba(0,0,0,.4)",
}

export function useTheme(): Theme {
  const { colorMode } = usePlatform()
  return colorMode === "dark" ? DARK : LIGHT
}
