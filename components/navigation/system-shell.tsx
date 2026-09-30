import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { ResponsiveShell } from "@/components/navigation/responsive-shell"
import { SystemSidebar } from "@/components/navigation/system-sidebar"

export async function SystemShell({
  children,
  mainClassName = "min-w-0 flex-1",
}: {
  children: ReactNode
  mainClassName?: string
}) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!actor.active) redirect("/auth/login?erro=inativo")

  return (
    <ResponsiveShell sidebar={<SystemSidebar role={actor.role} userName={actor.display_name} />} mainClassName={mainClassName}>
      {children}
    </ResponsiveShell>
  )
}
