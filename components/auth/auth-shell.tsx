import type { ReactNode } from "react"

/* Moldura visual compartilhada das telas de autenticação.
   Rail verde institucional à esquerda, cartão branco à direita. */
export function AuthShell({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-svh flex-col md:flex-row">
      <section className="flex flex-col justify-between bg-[#00302b] p-8 text-[#b4fcf1] md:w-2/5 md:p-12">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-[#88005b] text-sm font-bold text-white">U</span>
            <span className="text-sm font-semibold text-white">UniMetrocamp Wyden</span>
          </div>
          <h1 className="mt-10 text-balance text-2xl font-semibold leading-tight text-white md:text-3xl">
            CRM de convênios empresariais
          </h1>
          <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-[#b4fcf1]/80">
            Organize a carteira, priorize contatos, acompanhe o funil e gere os links de inscrição de cada empresa —
            tudo em um só lugar.
          </p>
        </div>
        <p className="mt-10 hidden font-mono text-[11px] text-[#b4fcf1]/50 md:block">
          Gestão comercial · B2B · Educação
        </p>
      </section>
      <section className="flex flex-1 items-center justify-center bg-slate-50 p-6 md:p-10">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold text-slate-900">{titulo}</h2>
          {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  )
}
