import { relationshipLabel, type PortfolioCompany } from "@/lib/b2b-portfolio/domain";

export function CompanyRelationship({
  company: c,
}: {
  company: PortfolioCompany;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="rounded-full bg-slate-100 px-2 py-1">
        Convênio: {c.agreement_status}
      </span>
      <span
        className={`rounded-full px-2 py-1 ${c.effective_relationship === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
      >
        {relationshipLabel(c)}
      </span>
      <span
        className={`rounded-full px-2 py-1 ${c.relationship_health === "Crítico" ? "bg-rose-100 text-rose-800" : c.relationship_health === "Atenção" ? "bg-amber-100 text-amber-900" : "bg-slate-50 text-slate-600"}`}
      >
        Saúde: {c.relationship_health}
      </span>
    </div>
  );
}
