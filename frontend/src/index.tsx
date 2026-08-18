"use client"

import { useCallback, useEffect, useState } from "react"
import { usePlatform } from "@palettelab/sdk"
import type { PluginComponentProps } from "@palettelab/sdk"
import type { Project } from "./types"
import { listProjects, upsertProject } from "./persist"
import PlatformControls from "./platformbar"
import Home from "./home"
import Editor from "./editor"

const SESSION_KEY = "annotator_open_project"

export default function AnnotatorApp(_props: PluginComponentProps) {
  const { apiFetch } = usePlatform()
  const [loaded, setLoaded] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [status, setStatus] = useState<{ msg: string; error?: boolean } | null>(null)
  const [backend, setBackend] = useState<"checking" | "ok" | "offline">("checking")

  useEffect(() => {
    let cancelled = false
    listProjects().then((all) => {
      if (cancelled) return
      setProjects(all)
      // Restore last open project if session has one
      const lastId = sessionStorage.getItem(SESSION_KEY)
      if (lastId) {
        const found = all.find((x) => x.id === lastId)
        if (found) setProject(found)
      }
      // No lastId → stay on home page (project = null)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiFetch("/api/v1/plugins/annotator-app/health")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setBackend(j && j.ok ? "ok" : "offline")
      })
      .catch(() => {
        if (!cancelled) setBackend("offline")
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch])

  const toast = useCallback((msg: string, error?: boolean) => {
    setStatus({ msg, error })
    window.setTimeout(() => setStatus(null), error ? 5000 : 2500)
  }, [])

  const openProject = async (p: Project) => {
    const all = await listProjects()
    const found = all.find((x) => x.id === p.id) ?? p
    sessionStorage.setItem(SESSION_KEY, found.id)
    setProject(found)
  }

  const saveProject = async (p: Project) => {
    await upsertProject(p)
    setProjects(await listProjects())
  }

  const exitEditor = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setProject(null)
  }

  const headerExtra = <PlatformControls backend={backend} />

  if (!loaded) return null

  return (
    <div style={{ fontFamily: "Inter, -apple-system, sans-serif" }}>
      {project ? (
        <Editor key={project.id} project={project} onProject={saveProject} onExit={exitEditor} onToast={toast} headerExtra={headerExtra} />
      ) : (
        <Home projects={projects} onNew={(p) => { sessionStorage.setItem(SESSION_KEY, p.id); setProject(p) }} onOpen={openProject} onToast={toast} headerExtra={headerExtra} backend={backend} />
      )}

      {status && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: status.error ? "#DC2626" : "#111",
            boxShadow: "0 12px 40px rgba(0,0,0,.25)",
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  )
}
