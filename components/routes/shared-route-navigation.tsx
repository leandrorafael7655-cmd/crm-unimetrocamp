"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { MapPinned, Route } from "lucide-react"

export function SharedRouteNavigation() {
  const [host, setHost] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const highSchoolLink = document.querySelector<HTMLAnchorElement>('nav a[href="/high-school"]')
    const section = highSchoolLink?.parentElement
    if (!section || !section.parentElement) return

    const existing = section.parentElement.querySelector<HTMLDivElement>("[data-shared-route-nav]")
    if (existing) {
      setHost(existing)
      return
    }

    const container = document.createElement("div")
    container.dataset.sharedRouteNav = "true"
    section.insertAdjacentElement("afterend", container)
    setHost(container)

    return () => {
      container.remove()
    }
  }, [])

  if (!host) return null

  return createPortal(
    <div className="border-t border-slate-800 px-2 py-2">
      <div className="flex gap-1 md:block">
        <a
          href="/mapa"
          className="flex flex-1 items-center gap-2 whitespace-nowrap rounded px-4 py-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 md:w-full md:py-2"
        >
          <MapPinned className="h-4 w-4 shrink-0" />
          Mapa
        </a>
        <a
          href="/mapa/rotas"
          className="flex flex-1 items-center gap-2 whitespace-nowrap rounded px-4 py-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 md:w-full md:py-2"
        >
          <Route className="h-4 w-4 shrink-0" />
          Rotas
        </a>
      </div>
    </div>,
    host,
  )
}
