"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadPortfolio } from "@/app/actions/b2b-portfolio";
import {
  availableCompany,
  brDate,
  type PortfolioData,
} from "@/lib/b2b-portfolio/domain";
import { CompanyRelationship } from "./company-relationship";
import { RequestDialog, secondary, TransferDialog } from "./portfolio-dialogs";

export function CompanyPortfolioSummary({
  companyId,
  refreshToken,
  onChanged,
}: {
  companyId: string;
  refreshToken?: string;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<PortfolioData | null>(null),
    [error, setError] = useState("");
  const [transfer, setTransfer] = useState(false),
    [request, setRequest] = useState(false);
  const refresh = useCallback(async () => {
    const r = await loadPortfolio(companyId);
    if (r.ok) {
      setData(r.data);
      setError("");
    } else setError(r.message);
  }, [companyId]);
  useEffect(() => {
    let active = true;
    loadPortfolio(companyId).then((r) => {
      if (!active) return;
      if (r.ok) setData(r.data);
      else setError(r.message);
    });
    return () => {
      active = false;
    };
  }, [companyId, refreshToken]);
  if (error)
    return (
      <p role="alert" className="my-3 text-sm text-rose-700">
        {error}
      </p>
    );
  const company = data?.companies[0];
  if (!data || !company)
    return (
      <p className="my-3 text-xs text-slate-500">
        Carregando relacionamento e carteira…
      </p>
    );
  const done = () => {
    refresh();
    onChanged?.();
  };
  return (
    <section className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm">
        Consultor responsável: <strong>{company.owner_name}</strong>
      </p>
      <CompanyRelationship company={company} />
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Ciclo atual</dt>
          <dd className="font-medium">
            {data.cycle.code} · {data.cycle.name}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Período</dt>
          <dd>
            {brDate(data.cycle.start)} a {brDate(data.cycle.end)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Última ação comercial válida</dt>
          <dd>
            {company.last_action_type || "Nenhuma"} ·{" "}
            {brDate(company.last_action_date)} ·{" "}
            {company.last_action_cycle?.code || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Ação registrada no ciclo atual</dt>
          <dd>{company.has_action_current_cycle ? "Sim" : "Não"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Próxima ação</dt>
          <dd>
            {company.has_next_action
              ? `${company.proxima_acao || "Reunião agendada"} · ${brDate(company.data_proxima_acao)}`
              : "Nenhuma próxima ação agendada"}
          </dd>
        </div>
      </dl>
      {company.effective_relationship === "active" &&
        !company.has_action_current_cycle && (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            Atenção — Empresa sem ação no ciclo {data.cycle.code}. Nenhuma ação
            válida registrada entre {brDate(data.cycle.start)} e{" "}
            {brDate(data.cycle.end)}.
            {company.at_risk
              ? ` Faltam ${company.days_to_cycle_end} dias para o fim do ciclo.`
              : ""}
          </p>
        )}
      <div className="mt-3 flex flex-wrap gap-2">
        {data.actor.manager && (
          <button className={secondary} onClick={() => setTransfer(true)}>
            Transferir empresa
          </button>
        )}
        {data.actor.canRequest &&
          company.owner_id !== data.actor.id &&
          availableCompany(company) && (
            <button
              className={secondary}
              disabled={company.pending_request}
              onClick={() => setRequest(true)}
            >
              {company.pending_request
                ? "Solicitação pendente"
                : "Solicitar atendimento"}
            </button>
          )}
        <Link className={secondary} href={`/b2b/carteira?tab=historico`}>
          Histórico de carteira
        </Link>
        <Link className={secondary} href={`/?company=${company.id}&schedule=1`}>
          Agendar próxima ação
        </Link>
      </div>
      {company.effective_relationship === "active" &&
        company.owner_id !== data.actor.id &&
        !data.actor.manager && (
          <p className="mt-2 text-xs text-slate-500">
            Empresa em atendimento por {company.owner_name}.
          </p>
        )}
      {transfer && (
        <TransferDialog
          companies={data.companies}
          users={data.users}
          initialCompany={company}
          onClose={() => setTransfer(false)}
          onDone={done}
        />
      )}
      {request && (
        <RequestDialog
          company={company}
          actorName={data.actor.name}
          onClose={() => setRequest(false)}
          onDone={done}
        />
      )}
    </section>
  );
}
