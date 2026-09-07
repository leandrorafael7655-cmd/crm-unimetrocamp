import { redirect } from "next/navigation"
import { managerExists } from "@/app/actions/team"
import { AuthShell } from "@/components/auth/auth-shell"
import { SetupForm } from "@/components/auth/setup-form"

export const dynamic = "force-dynamic"

export default async function SetupPage() {
  // Fluxo idempotente: só disponível enquanto não existir gerente ativo.
  if (await managerExists()) {
    redirect("/auth/login?msg=" + encodeURIComponent("Administrador já configurado. Faça login."))
  }

  const exigeEmail = Boolean(process.env.INITIAL_ADMIN_EMAIL)

  return (
    <AuthShell
      titulo="Configurar administrador"
      subtitulo="Crie a primeira conta de gerência para iniciar o CRM."
    >
      <SetupForm exigeEmail={exigeEmail} />
    </AuthShell>
  )
}
