import Link from "next/link"
import { requireActor } from "@/lib/auth/guards"
import { AuthShell } from "@/components/auth/auth-shell"

export default async function ProfilePage() {
  const actor = await requireActor()
  return <AuthShell titulo="Meu perfil" subtitulo="Gerencie seu acesso ao UniConecta.">
    <div className="space-y-4 text-sm text-slate-700">
      <p className="font-semibold">{actor.full_name}</p><p>{actor.email}</p>
      <Link href="/perfil/alterar-senha" className="inline-flex rounded-xl bg-[#88005b] px-4 py-3 font-semibold text-white">Alterar minha senha</Link>
      <Link href="/dashboard" className="block text-slate-500 underline">Voltar ao CRM</Link>
    </div>
  </AuthShell>
}
