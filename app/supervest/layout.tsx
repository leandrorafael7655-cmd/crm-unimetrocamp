import type React from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { ModuleShell } from "@/components/goals/module-shell"

export default async function SupervestLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!can(actor.role, "supervest.read")) redirect("/")

  return (
    <ModuleShell titulo="SuperVest" subtitulo="Captação e inscrições">
      {children}
    </ModuleShell>
  )
}
