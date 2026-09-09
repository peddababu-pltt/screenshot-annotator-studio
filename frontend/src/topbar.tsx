import { usePlatform } from "@palettelab/sdk"
import { useTheme } from "./theme"
import { useT } from "./translations"
import { I } from "./icons"

/** Initials for the avatar chip, e.g. "Palette Developer" → "PD". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ShellTopBar() {
  const { colorMode, setColorMode, language, setLanguage, supportedLanguages, user, organizationId } = usePlatform()
  const th = useTheme()
  const sh = th.shell
  const { t } = useT()
  const dark = colorMode === "dark"
  const displayName = user?.name || user?.email || ""

  return (
    <header style={{
      height: 64, flexShrink: 0, display: "flex", alignItems: "center", gap: 16,
      padding: "0 24px", borderBottom: `1px solid ${sh.border}`, background: sh.pageBg,
    }}>
      {/* Search — presentational only for now, no filtering wired up */}
      <div style={{
        flex: "1 1 auto", maxWidth: 670, display: "flex", alignItems: "center", gap: 10,
        height: 42, padding: "0 16px", borderRadius: 12, background: sh.fieldBg,
      }}>
        <span style={{ display: "flex", color: sh.textFaint }}>{I.search}</span>
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          style={{
            flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none",
            fontSize: 13.5, color: sh.text, fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Colour mode: sun glyph + switch */}
      <span style={{ display: "flex", color: sh.textMuted }}>{dark ? I.moon : I.sun}</span>
      <button
        onClick={() => setColorMode(dark ? "light" : "dark")}
        title={dark ? t("lightMode") : t("darkMode")}
        aria-label={dark ? t("lightMode") : t("darkMode")}
        style={{
          width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", padding: 3,
          background: dark ? "#4E555F" : "#A2AAB4", display: "flex",
          justifyContent: dark ? "flex-end" : "flex-start", alignItems: "center",
          transition: "background .15s",
        }}
      >
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
      </button>

      {/* Language */}
      {supportedLanguages && supportedLanguages.length > 1 && (
        <label
          title={t("language")}
          style={{
            display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 999,
            background: sh.surface, border: `1px solid ${sh.border}`, cursor: "pointer",
          }}
        >
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ border: "none", background: "transparent", color: sh.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer", outline: "none", fontFamily: "inherit" }}
          >
            {supportedLanguages.map((l) => (
              <option key={l} value={l} style={{ color: "#111" }}>{l}</option>
            ))}
          </select>
        </label>
      )}

      {/* Account */}
      {user && (
        <div
          title={`${t("user")}: ${displayName} (${user.id}) · ${t("organization")} #${organizationId}`}
          style={{ display: "flex", alignItems: "center", gap: 9 }}
        >
          <span style={{
            width: 34, height: 34, borderRadius: "50%", background: sh.ink, color: dark ? sh.pageBg : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12.5, fontWeight: 700, letterSpacing: ".3px", flexShrink: 0,
          }}>
            {initials(displayName)}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: sh.text, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
          <span style={{ display: "flex", color: sh.textFaint }}>{I.chevD}</span>
        </div>
      )}
    </header>
  )
}
