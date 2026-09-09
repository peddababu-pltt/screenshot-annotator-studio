import type { ShellPalette } from "./theme"

/**
 * Decorative line-art and dot grids that sit behind the shell's content areas
 * (home content column, editor canvas well). Purely presentational.
 */
export default function ShellBackdrop({ sh, opacity = 1 }: { sh: ShellPalette; opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity }}
      preserveAspectRatio="none"
      viewBox="0 0 1200 800"
    >
      <defs>
        <pattern id="shellDots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill={sh.borderDashed} />
        </pattern>
      </defs>
      <rect x="930" y="40" width="250" height="150" fill="url(#shellDots)" opacity=".5" />
      <rect x="960" y="470" width="220" height="180" fill="url(#shellDots)" opacity=".4" />
      <g fill="none" stroke={sh.borderDashed} strokeWidth="1" opacity=".75">
        <path d="M700 0 C 900 60, 1050 30, 1200 -30" />
        <path d="M760 -10 C 960 70, 1090 50, 1200 10" />
        <path d="M0 690 C 220 610, 430 700, 640 640 C 850 580, 1030 660, 1200 600" />
        <path d="M0 760 C 240 690, 470 770, 700 705" />
      </g>
    </svg>
  )
}
