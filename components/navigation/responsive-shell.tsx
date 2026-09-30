"use client"

import type { ReactNode } from "react"
import { useEffect, useId, useState } from "react"
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react"

const STORAGE_KEY = "uniconecta.sidebar.collapsed"

/** O menu participa do grid: sua largura nunca é somada à largura da janela. */
export function ResponsiveShell({
  sidebar,
  children,
  mainClassName = "",
}: {
  sidebar: ReactNode
  children: ReactNode
  mainClassName?: string
}) {
  const menuId = useId()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === "true") } catch {}
  }, [])

  function toggleDesktop() {
    setCollapsed((current) => {
      const next = !current
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
      return next
    })
  }

  return (
    <div className="uni-shell min-h-screen bg-[#faf7f9] font-sans text-slate-900"
      data-sidebar-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <aside className="uni-sidebar" aria-label="Menu principal">
        <div className="uni-sidebar-toolbar">
          <span className="uni-mobile-brand text-lg font-bold text-white">UniConecta</span>
          <button type="button" onClick={toggleDesktop}
            className="uni-desktop-toggle rounded-lg p-2 text-[#b4fcf1] hover:bg-white/10"
            aria-controls={menuId} aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => setMobileOpen((current) => !current)}
            className="uni-mobile-toggle rounded-lg p-2 text-[#b4fcf1] hover:bg-white/10"
            aria-controls={menuId} aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <div id={menuId} className="uni-sidebar-content" onClick={(event) => {
          if ((event.target as HTMLElement).closest("a, button[aria-current]")) setMobileOpen(false)
        }}>
          {sidebar}
        </div>
      </aside>
      <main className={`uni-main ${mainClassName}`}>{children}</main>
    </div>
  )
}
