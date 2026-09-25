export function UniConectaBrand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" fill="none" aria-hidden="true">
        <rect width="48" height="48" rx="13" fill={inverse ? "#ffffff" : "#88005b"} fillOpacity={inverse ? 0.12 : 1} />
        <path d="M15 15v13a9 9 0 0 0 18 0V15" stroke="white" strokeWidth="4" strokeLinecap="round" />
        <circle cx="15" cy="14" r="4" fill="#b4fcf1" />
        <circle cx="33" cy="14" r="4" fill="#FA4616" />
      </svg>
      <div>
        <p className={`text-xl font-bold tracking-[-0.035em] ${inverse ? "text-white" : "text-slate-900"}`}>UniConecta</p>
        <p className={`mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${inverse ? "text-white/60" : "text-slate-500"}`}>Gestão comercial integrada</p>
      </div>
    </div>
  )
}
