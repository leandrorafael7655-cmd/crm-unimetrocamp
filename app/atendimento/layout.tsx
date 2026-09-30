import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { ResponsiveShell } from "@/components/navigation/responsive-shell"
import { SystemSidebar } from "@/components/navigation/system-sidebar"

export const dynamic = "force-dynamic"

export default async function AtendimentoLayout({ children }: { children: ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!actor.active) redirect("/auth/login?erro=inativo")
  if (!can(actor.role, "attendance.read")) redirect("/dashboard")

  return (
    <ResponsiveShell sidebar={<SystemSidebar role={actor.role} userName={actor.display_name} />} mainClassName="min-w-0 flex-1 p-3 sm:p-5 lg:p-6">{children}</ResponsiveShell>
  )
}
