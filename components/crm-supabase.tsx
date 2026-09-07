"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import CrmApp from "@/components/crm-app"
import { createClient } from "@/lib/supabase/client"
import { setStorage } from "@/lib/data/storage-context"
import { makeSupabaseStorage } from "@/lib/data/supabase-storage"
import { GerenciarUsuarios } from "@/components/team/gerenciar-usuarios"
import type { Usuario } from "@/lib/domain/types"

/* Modo Supabase: instala o backend do Supabase (com o perfil autenticado) antes
   de o CRM montar. O inicializador do useState garante essa ordem. */
export default function CrmSupabase({ perfil }: { perfil: Usuario }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  useState(() => {
    setStorage(makeSupabaseStorage(supabase, perfil))
    return null
  })

  const aoSair = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  const podeGerenciar = perfil.role === "gerente" || perfil.role === "supervisor"

  return (
    <CrmApp
      modo="supabase"
      usuarioInicial={perfil}
      aoSair={aoSair}
      painelEquipe={podeGerenciar ? <GerenciarUsuarios perfil={perfil} /> : null}
    />
  )
}
