import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { SystemSidebar } from "@/components/navigation/system-sidebar"

export const dynamic = "force-dynamic"

export default async function MapaLayout({ children }: { children: ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!actor.active) redirect("/auth/login?erro=inativo")
  if (!can(actor.role, "map.read") && !can(actor.role, "routes.plan")) redirect("/")

  return (
    <div className="min-h-screen bg-[#faf7f9] font-sans text-slate-900 md:flex">
      <SystemSidebar role={actor.role} userName={actor.full_name} />
      <main className="min-w-0 flex-1 md:h-screen md:overflow-auto">{children}</main>
    </div>
  )
}
