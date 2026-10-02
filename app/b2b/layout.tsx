import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { ResponsiveShell } from "@/components/navigation/responsive-shell"
import { SystemSidebar } from "@/components/navigation/system-sidebar"

export const dynamic = "force-dynamic"
export default async function B2BLayout({ children }: { children: ReactNode }) {
  const actor = await getActor()
  if (!actor || !actor.active) redirect("/auth/login")
  return <ResponsiveShell sidebar={<SystemSidebar role={actor.role} userName={actor.full_name} />} mainClassName="min-w-0 flex-1 p-3 sm:p-5 lg:p-6">{children}</ResponsiveShell>
}
