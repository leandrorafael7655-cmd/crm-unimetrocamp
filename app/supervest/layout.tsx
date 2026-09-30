import type React from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { ResponsiveShell } from "@/components/navigation/responsive-shell"
import { SystemSidebar } from "@/components/navigation/system-sidebar"

export default async function SupervestLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!actor.active) redirect("/auth/login?erro=inativo")
  if (!can(actor.role, "supervest.read")) redirect("/")

  return (
    <ResponsiveShell sidebar={<SystemSidebar role={actor.role} userName={actor.full_name} />} mainClassName="min-w-0 flex-1 p-4 sm:p-6">{children}</ResponsiveShell>
  )
}
