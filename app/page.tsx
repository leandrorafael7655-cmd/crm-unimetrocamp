import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import CrmSupabase from "@/components/crm-supabase"
import { papelDeRole } from "@/lib/data/mapping"
import type { Usuario } from "@/lib/domain/types"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: perfilRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  // Conta sem perfil vinculado — não deve acessar o CRM.
  if (!perfilRow) {
    await supabase.auth.signOut()
    redirect("/auth/login?erro=sem-perfil")
  }

  // Acesso desativado pela gerência.
  if (perfilRow.active === false) {
    await supabase.auth.signOut()
    redirect("/auth/login?erro=inativo")
  }

  const perfil: Usuario = {
    id: perfilRow.id,
    nome: perfilRow.full_name || user.email || "Usuário",
    papel: papelDeRole(perfilRow.role),
    tag: perfilRow.consultant_tag || "",
    email: perfilRow.email || user.email || "",
    role: perfilRow.role,
  }

  return <CrmSupabase perfil={perfil} />
}
