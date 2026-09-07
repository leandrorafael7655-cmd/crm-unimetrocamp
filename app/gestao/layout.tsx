import type React from "react"
import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { ModuleShell } from "@/components/goals/module-shell"

export default async function GestaoLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  // Central de Metas é exclusiva da gestão (gerente/supervisor).
  if (!can(actor.role, "goals.read.all")) redirect("/")

  return (
    <ModuleShell titulo="Gestão" subtitulo="Metas e SuperVestibular">
      {children}
    </ModuleShell>
  )
}
