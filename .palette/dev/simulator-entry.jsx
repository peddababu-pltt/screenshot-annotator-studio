
import React from "react"
import { createRoot } from "react-dom/client"
import { PluginProvider } from "@palettelab/sdk"
import Plugin from "/Users/peddababu/Desktop/screenshot annotator/annotator-app/frontend/src/index.tsx"

const backendBase = "http://127.0.0.1:8732"
const localConnections = {}

function connectionListResponse() {
  return new Response(JSON.stringify(Object.values(localConnections)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

const devOrganization = {
  id: 1,
  name: "Palette Dev",
  slug: "palette-dev",
  description: "Local development organisation",
  company_type: "IT & Engineering",
  logo_url: null,
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
}

async function apiFetch(path, init) {
  const target = String(path || "")
  const method = String(init?.method || "GET").toUpperCase()
  if (target === "/api/v1/org" && method === "GET") {
    return new Response(JSON.stringify(devOrganization), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  const connectionPrefix = "/api/v1/app-installs/" + encodeURIComponent("annotator-app") + "/connections"
  if (target === connectionPrefix && method === "GET") {
    return connectionListResponse()
  }
  if (target.startsWith(connectionPrefix + "/") && target.endsWith("/authorize") && method === "POST") {
    const id = decodeURIComponent(target.slice((connectionPrefix + "/").length, -"/authorize".length))
    if (localConnections[id]) {
      localConnections[id] = {
        ...localConnections[id],
        status: "connected",
        account_label: localConnections[id].account_label || "Local mock account",
        granted_scopes: localConnections[id].granted_scopes?.length ? localConnections[id].granted_scopes : localConnections[id].scopes,
        connected_at: new Date().toISOString(),
      }
    }
    return new Response(JSON.stringify({ connection_id: id, authorize_url: "palette-local://connected", mode: "mock" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  if (target.startsWith(connectionPrefix + "/") && method === "DELETE") {
    const id = decodeURIComponent(target.slice((connectionPrefix + "/").length))
    if (localConnections[id]) {
      localConnections[id] = { ...localConnections[id], status: "available", account_label: null, connected_at: null, granted_scopes: [] }
    }
    return new Response(null, { status: 204 })
  }
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return fetch(target, init)
  }
  if (target.startsWith("/api/")) {
    return fetch(backendBase + target, init)
  }
  return fetch(target, init)
}

const basePlatform = {
  user: {
    id: "dev-user",
    email: "developer@palette.local",
    name: "Palette Developer",
    is_active: true,
    created_at: new Date().toISOString(),
    onboarding_completed: true,
    company_name: "Palette Local",
    company_type: "Development",
    org_theme: null,
    org_logo: null,
    org_enabled_menu_items: null,
    org_menu_labels: null,
    org_enabled_apps: ["annotator-app"],
    org_app_store_enabled: true,
    org_enabled_agent_ids: null,
    organization_id: 1,
    org_role: "owner",
  },
  organizationId: 1,
  pluginId: "annotator-app",
  orgRole: "owner",
  orgs: [{ id: 1, name: "Palette Dev", slug: "palette-dev", theme_id: "default", logo_url: null }],
  agents: [],
  permissions: [],
  apiFetch,
  navigate: (path) => window.history.pushState(null, "", path),
  showToast: (message, type = "info") => {
    window.dispatchEvent(new CustomEvent("palette-toast", { detail: { message, type } }))
    console.log("[palette-toast]", type, message)
  },
}

function normalizePaletteLanguage(language, fallback = "en") {
  const value = String(language || "").trim().toLowerCase()
  return value ? value.split("-")[0] : fallback
}

function normalizePaletteColorMode(mode, fallback = "light") {
  return mode === "dark" ? "dark" : fallback
}

function detectPaletteColorMode() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"
}

function applyPaletteColorMode(mode) {
  const normalized = normalizePaletteColorMode(mode)
  document.documentElement.classList.toggle("dark", normalized === "dark")
  document.documentElement.style.colorScheme = normalized
  window.dispatchEvent(new CustomEvent("palette:theme-change", { detail: { colorMode: normalized } }))
}

function Toasts() {
  const [items, setItems] = React.useState([])
  React.useEffect(() => {
    const onToast = (event) => {
      const id = Date.now()
      setItems((current) => [...current, { id, ...event.detail }])
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 2500)
    }
    window.addEventListener("palette-toast", onToast)
    return () => window.removeEventListener("palette-toast", onToast)
  }, [])
  return React.createElement("div", { className: "palette-local-toasts" },
    items.map((item) => React.createElement("div", { key: item.id, className: "palette-local-toast" }, item.message))
  )
}

function Shell() {
  const [language, updateLanguage] = React.useState(() => normalizePaletteLanguage(navigator.language))
  const [colorMode, updateColorMode] = React.useState(() => detectPaletteColorMode())
  const platform = React.useMemo(() => ({
    ...basePlatform,
    language,
    fallbackLanguage: "en",
    supportedLanguages: ["en", "ko"],
    setLanguage: (nextLanguage) => {
      const normalized = normalizePaletteLanguage(nextLanguage)
      updateLanguage(normalized)
      document.documentElement.lang = normalized
      window.dispatchEvent(new CustomEvent("palette:language-change", { detail: { language: normalized } }))
    },
    colorMode,
    setColorMode: (nextMode) => {
      updateColorMode(normalizePaletteColorMode(nextMode))
    },
  }), [language, colorMode])

  React.useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  React.useEffect(() => {
    applyPaletteColorMode(colorMode)
  }, [colorMode])

  React.useEffect(() => {
    const onLanguageChange = () => updateLanguage(normalizePaletteLanguage(navigator.language))
    window.addEventListener("languagechange", onLanguageChange)
    return () => window.removeEventListener("languagechange", onLanguageChange)
  }, [])

  React.useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    if (!media) return
    const onColorModeChange = () => updateColorMode(detectPaletteColorMode())
    media.addEventListener?.("change", onColorModeChange)
    return () => media.removeEventListener?.("change", onColorModeChange)
  }, [])

  return React.createElement(PluginProvider, { value: platform },
    React.createElement("main", { className: "palette-local-shell" },
      React.createElement(Plugin, { platform }),
      React.createElement(Toasts)
    )
  )
}

createRoot(document.getElementById("root")).render(React.createElement(Shell))
