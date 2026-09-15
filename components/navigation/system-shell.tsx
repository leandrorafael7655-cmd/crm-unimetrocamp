import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
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
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 md:flex">
      <SystemSidebar role={actor.role} userName={actor.full_name} />
      <main className={mainClassName}>{children}</main>
    </div>
  )
}
