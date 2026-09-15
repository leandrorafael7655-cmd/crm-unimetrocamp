"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { SystemSidebarMenu, type LegacyB2BSelection } from "@/components/navigation/system-sidebar"

type LegacyView = LegacyB2BSelection["view"]

const LEGACY_LABEL: Record<LegacyView, string> = {
  painel: "Painel",
  carteira: "Minha carteira",
  consulta: "De quem é?",
  empresas: "Todas as empresas",
  agenda: "Agenda",
  funil: "Funil",
  equipe: "Equipe e links",
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function findLegacyNav(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("nav")).find((nav) => {
    const text = normalizeText(nav.textContent)
    return text.includes("Minha carteira") && text.includes("Todas as empresas") && text.includes("Funil")
  }) ?? null
}

function findLegacyButton(nav: HTMLElement, view: LegacyView): HTMLButtonElement | null {
  const label = LEGACY_LABEL[view]
  return Array.from(nav.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => normalizeText(button.textContent) === label,
  ) ?? null
}

function scrollToFocus(focus: LegacyB2BSelection["focus"]) {
  if (!focus || focus === "equipe") {
    window.scrollTo({ top: 0, behavior: "smooth" })
    return
  }

  window.setTimeout(() => {
    const input = document.querySelector<HTMLInputElement>('input[placeholder*="inscricao.unimetrocamp"]')
    const target = input?.closest<HTMLElement>("section") ?? input?.closest<HTMLElement>("div.rounded-lg") ?? input
    target?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, 120)
}

export function LegacySidebarBridge({ role }: { role?: string | null }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [legacyNav, setLegacyNav] = useState<HTMLElement | null>(null)
  const [activeView, setActiveView] = useState<LegacyView>("painel")

  useEffect(() => {
    let cleanupMounted: (() => void) | null = null
    let waitObserver: MutationObserver | null = null

    const mount = (nav: HTMLElement) => {
      setLegacyNav(nav)

      const list = nav.querySelector<HTMLElement>("ul")
      const highSchoolLink = nav.querySelector<HTMLAnchorElement>('a[href="/high-school"]')
      const highSchoolSection = highSchoolLink?.parentElement ?? null
      const oldSharedRoutes = nav.querySelector<HTMLElement>("[data-shared-route-nav]")
      const brand = nav.querySelector<HTMLElement>("div.hidden")

      const oldListDisplay = list?.style.display ?? ""
      const oldHsDisplay = highSchoolSection?.style.display ?? ""
      const oldRoutesDisplay = oldSharedRoutes?.style.display ?? ""

      if (list) list.style.display = "none"
      if (highSchoolSection) highSchoolSection.style.display = "none"
      if (oldSharedRoutes) oldSharedRoutes.style.display = "none"

      const container = document.createElement("div")
      container.dataset.unifiedSidebarHost = "true"
      if (brand) brand.insertAdjacentElement("afterend", container)
      else nav.prepend(container)
      setHost(container)

      const buttons = Object.keys(LEGACY_LABEL)
        .map((view) => findLegacyButton(nav, view as LegacyView))
        .filter(Boolean) as HTMLButtonElement[]

      const syncActive = () => {
        const active = (Object.keys(LEGACY_LABEL) as LegacyView[]).find((view) => {
          const button = findLegacyButton(nav, view)
          return button?.className.includes("bg-slate-800")
        })
        if (active) setActiveView(active)
      }

      syncActive()
      const activeObserver = new MutationObserver(syncActive)
      buttons.forEach((button) => activeObserver.observe(button, { attributes: true, attributeFilter: ["class"] }))

      const query = new URLSearchParams(window.location.search)
      const requestedView = query.get("view") as LegacyView | null
      const focus = query.get("focus") as LegacyB2BSelection["focus"] | null
      if (requestedView && requestedView in LEGACY_LABEL) {
        window.setTimeout(() => {
          findLegacyButton(nav, requestedView)?.click()
          setActiveView(requestedView)
          scrollToFocus(focus ?? undefined)
        }, 0)
      }

      cleanupMounted = () => {
        activeObserver.disconnect()
        container.remove()
        if (list) list.style.display = oldListDisplay
        if (highSchoolSection) highSchoolSection.style.display = oldHsDisplay
        if (oldSharedRoutes) oldSharedRoutes.style.display = oldRoutesDisplay
      }
    }

    const existing = findLegacyNav()
    if (existing) {
      mount(existing)
    } else {
      waitObserver = new MutationObserver(() => {
        const nav = findLegacyNav()
        if (!nav) return
        waitObserver?.disconnect()
        waitObserver = null
        mount(nav)
      })
      waitObserver.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      waitObserver?.disconnect()
      cleanupMounted?.()
    }
  }, [])

  const select = useMemo(
    () => (selection: LegacyB2BSelection) => {
      if (!legacyNav) return
      const button = findLegacyButton(legacyNav, selection.view)
      button?.click()
      setActiveView(selection.view)
      scrollToFocus(selection.focus)
      if (window.location.search) window.history.replaceState({}, "", window.location.pathname)
    },
    [legacyNav],
  )

  if (!host) return null

  return createPortal(
    <SystemSidebarMenu role={role} embedded activeLegacyView={activeView} onLegacySelect={select} />,
    host,
  )
}
