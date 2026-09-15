import type { ReactNode } from "react"
import { Building2, GraduationCap, Route } from "lucide-react"

const pilares = [
  { label: "Empresas", Icone: Building2 },
  { label: "High School", Icone: GraduationCap },
  { label: "Rotas", Icone: Route },
]

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
    <main className="min-h-svh overflow-x-hidden bg-[#faf7f9] md:grid md:grid-cols-[minmax(0,1.08fr)_minmax(410px,0.92fr)]">
      <section className="relative flex min-h-[220px] overflow-hidden bg-[linear-gradient(145deg,#910061_0%,#73004f_52%,#54003a_100%)] px-6 py-7 text-white sm:px-8 md:min-h-svh md:px-10 md:py-10 lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 top-[18%] h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -right-6 top-[31%] h-44 w-44 rounded-full border border-[#ff7a3b]/20" />
          <div className="absolute bottom-[17%] left-[12%] h-px w-[62%] rotate-[-8deg] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="absolute bottom-[33%] left-[30%] h-px w-[50%] rotate-[18deg] bg-gradient-to-r from-transparent via-[#ff7a3b]/20 to-transparent" />
          <span className="absolute bottom-[30%] left-[28%] h-2 w-2 rounded-full bg-[#ff6a22]/70 shadow-[0_0_0_7px_rgba(255,106,34,0.08)]" />
          <span className="absolute right-[16%] top-[29%] h-2 w-2 rounded-full bg-white/65 shadow-[0_0_0_7px_rgba(255,255,255,0.07)]" />
        </div>

        <div className="relative z-10 flex w-full max-w-3xl flex-col">
          <img
            src="/brand/unimetrocamp-on-purple.svg"
            alt="UniMetrocamp Wyden"
            width={300}
            height={75}
            className="h-auto w-[205px] sm:w-[225px] lg:w-[250px]"
          />

          <div className="mt-7 md:mt-auto md:mb-auto">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/65 sm:text-[11px]">
              Gestão comercial integrada
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
              UniConecta<span className="text-[#ff5b16]">.</span>
            </h1>
            <p className="mt-3 max-w-xl text-lg font-medium leading-snug text-white sm:text-xl lg:text-2xl">
              Conexões que geram oportunidades.
            </p>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/68 sm:text-base">
              Empresas, escolas e resultados em um só lugar.
            </p>

            <div className="mt-8 hidden max-w-xl grid-cols-3 gap-3 md:grid" aria-label="Áreas integradas do UniConecta">
              {pilares.map(({ label, Icone }) => (
                <div key={label} className="flex items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.07] px-3.5 py-3 text-sm font-medium text-white/90 backdrop-blur-sm">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[#ff8a52]">
                    <Icone className="h-4 w-4" aria-hidden />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-6 hidden text-xs font-medium tracking-wide text-white/48 md:block">
            Uma plataforma. Mais conexões. Novas conquistas.
          </p>
        </div>
      </section>

      <section className="relative flex items-start justify-center bg-[#faf7f9] px-4 py-7 sm:px-6 md:min-h-svh md:items-center md:px-8 md:py-10 lg:px-12">
        <div aria-hidden className="absolute right-8 top-8 hidden h-28 w-28 rounded-full bg-[#88005b]/[0.035] blur-2xl md:block" />
        <div className="relative w-full max-w-[450px] rounded-2xl border border-[#eadfe6] bg-white p-6 shadow-[0_22px_60px_rgba(77,20,55,0.09)] sm:p-8 lg:p-9">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#88005b]/65">
                UniConecta
              </p>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">{titulo}</h2>
              {subtitulo && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitulo}</p>}
            </div>
            <span className="mt-1 h-9 w-1 shrink-0 rounded-full bg-[#ff5b16]" aria-hidden />
          </div>
          {children}
        </div>
      </section>
    </main>
  )
}
