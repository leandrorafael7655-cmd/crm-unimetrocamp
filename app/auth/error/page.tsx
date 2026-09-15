import Link from "next/link"
import { AuthShell } from "@/components/auth/auth-shell"

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  return (
    <AuthShell titulo="Não foi possível concluir" subtitulo="Ocorreu um problema na autenticação do UniConecta.">
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-relaxed text-rose-700">
        {params?.error ? `Detalhe: ${params.error}` : "O link de acesso pode ter expirado ou já ter sido usado."}
      </p>
      <Link
        href="/auth/login"
        className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-[#88005b] px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[#72004d]"
      >
        Voltar ao login
      </Link>
    </AuthShell>
  )
}
