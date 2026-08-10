import { usePlatform } from "@palettelab/sdk"
import { useTheme } from "./theme"
import { useT } from "./translations"
import { I } from "./icons"

interface Props {
  backend: "checking" | "ok" | "offline"
}

export default function PlatformControls({ backend }: Props) {
  const { colorMode, setColorMode, language, setLanguage, supportedLanguages, user, organizationId } = usePlatform()
  const th = useTheme()
  const { t } = useT()

  const pillBase = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: th.surfaceAlt,
    border: `1px solid ${th.border}`,
    color: th.text,
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")}
        title={colorMode === "dark" ? t("lightMode") : t("darkMode")}
        style={{ ...pillBase, cursor: "pointer", padding: 7 }}
      >
        {colorMode === "dark" ? I.sun : I.moon}
      </button>

      {supportedLanguages && supportedLanguages.length > 1 && (
        <label style={{ ...pillBase, cursor: "pointer" }} title={t("language")}>
          {I.globe}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ border: "none", background: "transparent", color: th.text, fontSize: 11, fontWeight: 600, cursor: "pointer", outline: "none" }}
          >
            {supportedLanguages.map((l) => (
              <option key={l} value={l} style={{ color: "#111" }}>{l}</option>
            ))}
          </select>
        </label>
      )}

      {user && (
        <div style={pillBase} title={`${t("user")}: ${user.name || user.email} (${user.id}) · ${t("organization")} #${organizationId}`}>
          {I.userCircle}
          <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</span>
          <span style={{ color: th.textFaint }}>· {t("organization")} {organizationId}</span>
        </div>
      )}

      <div style={{ ...pillBase, color: backend === "ok" ? "#15803D" : backend === "offline" ? "#B45309" : th.textMuted }} title="Palette backend status">
        <span style={{ width: 8, height: 8, borderRadius: 999, background: backend === "ok" ? "#22C55E" : backend === "offline" ? "#F59E0B" : "#CBD5E1" }} />
        {backend === "ok" ? t("backendOk") : backend === "offline" ? t("backendOffline") : t("backendChecking")}
      </div>
    </div>
  )
}
