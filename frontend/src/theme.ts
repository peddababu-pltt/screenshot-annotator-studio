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
  bg: "#DCEDF9",
  surface: "#F2F9FD",
  surfaceAlt: "#C9E4F5",
  border: "#9FCDEA",
  text: "#111111",
  textMuted: "#6B6B6B",
  textFaint: "#999999",
  accent: "#006EB1",
  accentSoft: "#D3ECFA",
  accentBorder: "#7FC1E6",
  danger: "#DC2626",
  success: "#16A34A",
  shadow: "0 10px 30px rgba(0,0,0,.12)",
  shadowLg: "0 20px 60px rgba(0,0,0,.25), 0 4px 14px rgba(0,0,0,.15)",
}

const DARK: Theme = {
  mode: "dark",
  bg: "#161719",
  surface: "#1E1F23",
  surfaceAlt: "#26272C",
  border: "#34353B",
  text: "#F1F1F1",
  textMuted: "#A0A0A8",
  textFaint: "#78787F",
  accent: "#3B82F6",
  accentSoft: "#1D2A45",
  accentBorder: "#2C4373",
  danger: "#F87171",
  success: "#4ADE80",
  shadow: "0 10px 30px rgba(0,0,0,.45)",
  shadowLg: "0 20px 60px rgba(0,0,0,.6), 0 4px 14px rgba(0,0,0,.4)",
}

export function useTheme(): Theme {
  const { colorMode } = usePlatform()
  return colorMode === "dark" ? DARK : LIGHT
}
