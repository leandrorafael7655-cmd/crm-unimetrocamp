import Link from "next/link"
import { AuthShell } from "@/components/auth/auth-shell"

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  return (
    <AuthShell titulo="Não foi possível concluir" subtitulo="Ocorreu um problema na autenticação.">
      <p className="text-sm leading-relaxed text-slate-600">
        {params?.error ? `Detalhe: ${params.error}` : "O link de acesso pode ter expirado ou já ter sido usado."}
      </p>
      <Link
        href="/auth/login"
        className="mt-6 block rounded-md bg-[#88005b] px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[#6d0049]"
      >
        Voltar ao login
      </Link>
    </AuthShell>
  )
}
