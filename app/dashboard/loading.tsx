/* Skeleton do Dashboard Geral enquanto os agregados carregam no servidor. */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-slate-100">
      <header className="bg-brand-rail">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-5 sm:px-6">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-white/15" />
            <div className="h-3 w-56 rounded bg-white/10" />
          </div>
          <div className="h-8 w-24 rounded-full bg-white/10" />
        </div>
        <div className="mx-auto max-w-[1200px] px-4 pb-3 sm:px-6">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-7 w-28 rounded-full bg-white/10" />
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 h-4 w-32 rounded bg-slate-100" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-20 rounded-lg bg-slate-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
      <span className="sr-only" role="status">
        Carregando painel geral
      </span>
    </div>
  )
}
