import { get, set } from "idb-keyval"
import type { Project } from "./types"

const KEY = "annotator.projects.v1"
const ACTIVE = "annotator.active.v1"
const LEGACY_KEY = "annotator.projects.v1"

let cache: Project[] | null = null
let migrated = false

async function loadAll(): Promise<Project[]> {
  if (cache) return cache
  if (!migrated) {
    migrated = true
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw)
        if (Array.isArray(legacy) && legacy.length) {
          await set(KEY, legacy)
          localStorage.removeItem(LEGACY_KEY)
        }
      } catch {
        // ignore malformed legacy data
      }
    }
  }
  const stored = await get<Project[]>(KEY)
  cache = Array.isArray(stored) ? stored : []
  return cache
}

async function saveAll(all: Project[]): Promise<void> {
  cache = all
  await set(KEY, all)
}

export async function listProjects(): Promise<Project[]> {
  return loadAll()
}

export async function getProject(id: string): Promise<Project | null> {
  const all = await loadAll()
  return all.find((p) => p.id === id) || null
}

export async function upsertProject(p: Project): Promise<Project[]> {
  const all = await loadAll()
  const idx = all.findIndex((x) => x.id === p.id)
  const next = idx >= 0 ? all.map((x, i) => (i === idx ? p : x)) : [p, ...all]
  await saveAll(next)
  return next
}

export async function deleteProject(id: string): Promise<Project[]> {
  const all = await loadAll()
  const next = all.filter((x) => x.id !== id)
  if (localStorage.getItem(ACTIVE) === id) localStorage.removeItem(ACTIVE)
  await saveAll(next)
  return next
}

export function markActive(id: string | null) {
  if (id) localStorage.setItem(ACTIVE, id)
  else localStorage.removeItem(ACTIVE)
}

export function getActiveId(): string | null {
  return localStorage.getItem(ACTIVE)
}

export function clonePageImage(page: { dataUrl: string; w: number; h: number }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = page.dataUrl
  })
}

export function renderPage(p: Project, idx: number): string {
  try {
    const page = p.pages[idx]
    if (!page) return ""
    const cv = document.createElement("canvas")
    cv.width = page.w
    cv.height = page.h
    const ctx = cv.getContext("2d")!
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      window.dispatchEvent(new CustomEvent("annotator:thumb", { detail: cv.toDataURL("image/jpeg", 0.7) }))
    }
    img.src = page.dataUrl
    return ""
  } catch {
    return ""
  }
}
