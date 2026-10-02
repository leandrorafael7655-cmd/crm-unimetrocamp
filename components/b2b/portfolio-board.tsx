"use client";

import Link from "next/link";
import { CompanyRelationship } from "./company-relationship";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  cancelAssignmentRequest,
  loadPortfolio,
  markPortfolioNotificationRead,
  reviewAssignmentRequest,
  updatePortfolioSettings,
} from "@/app/actions/b2b-portfolio";
import {
  availableCompany,
  brDate,
  brDateTime,
  portfolioMetrics,
  relationshipColumn,
  relationshipLabel,
  REQUEST_LABELS,
  type PortfolioCompany,
  type PortfolioData,
} from "@/lib/b2b-portfolio/domain";
import {
  button,
  field,
  secondary,
  PortfolioDialog,
  RequestDialog,
  TransferDialog,
} from "./portfolio-dialogs";

const columns = [
  "Relacionamento ativo",
  "Atenção",
  "Sem relacionamento ativo",
  "Solicitação pendente",
  "Sem responsável",
];
export function PortfolioBoard({ initial }: { initial: PortfolioData }) {
  const requestedTab = useSearchParams().get("tab");
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("dashboard"),
    [query, setQuery] = useState("");
  const [owner, setOwner] = useState(""),
    [city, setCity] = useState("");
  const [agreement, setAgreement] = useState(""),
    [relationship, setRelationship] = useState("");
  const [cycle, setCycle] = useState(""),
    [kind, setKind] = useState("");
  const [since, setSince] = useState(""),
    [until, setUntil] = useState("");
  const [byOwner, setByOwner] = useState(false),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<null | {
    company?: PortfolioCompany;
    departure?: boolean;
  }>(null);
  const [request, setRequest] = useState<PortfolioCompany | null>(null);
  const [review, setReview] = useState<null | {
    id: string;
    status: "approved" | "rejected";
  }>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [riskDays, setRiskDays] = useState(
    initial.companies[0]?.risk_days || 30,
  );
  const [criticalDays, setCriticalDays] = useState(
    initial.companies[0]?.critical_days || 15,
  );
  useEffect(() => {
    const t = requestedTab;
    if (
      t &&
      [
        "dashboard",
        "carteira",
        "disponiveis",
        "solicitacoes",
        "kanban",
        "historico",
        "notificacoes",
      ].includes(t)
    )
      setTab(t);
  }, [requestedTab]);
  async function refresh() {
    setBusy(true);
    try {
      const r = await loadPortfolio();
      if (r.ok) setData(r.data);
      else setNotice(r.message);
    } finally {
      setBusy(false);
    }
  }
  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setNotice("");
    try {
      const r = await action();
      if (!r.ok) {
        setNotice(r.message || "Operação não concluída.");
        return false;
      }
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }
  const allScope = data.actor.manager || data.actor.supervisor;
  const own = data.companies.filter((c) => c.owner_id === data.actor.id);
  const dashboardCompanies = allScope ? data.companies : own;
  const metrics = portfolioMetrics(dashboardCompanies);
  const source =
    tab === "disponiveis"
      ? data.companies.filter(
          (c) => availableCompany(c) && c.owner_id !== data.actor.id,
        )
      : tab === "carteira"
        ? allScope
          ? data.companies
          : own
        : dashboardCompanies;
  const rows = source
    .filter(
      (c) =>
        (!query ||
          `${c.company_name} ${c.razao_social} ${c.cidade || ""} ${c.segmento || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(query.toLocaleLowerCase("pt-BR"))) &&
        (!owner ||
          (owner === "__unowned" ? !c.owner_id : c.owner_id === owner)) &&
        (!city || c.cidade === city) &&
        (!agreement || c.agreement_status === agreement) &&
        (!relationship || c.effective_relationship === relationship) &&
        (!cycle || c.last_action_cycle?.code === cycle) &&
        (!kind || c.last_action_type === kind) &&
        (!since || (!!c.last_action_date && c.last_action_date >= since)) &&
        (!until || (!!c.last_action_date && c.last_action_date <= until)),
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.company_name.localeCompare(b.company_name, "pt-BR"),
    );
  const tabs = [
    ["dashboard", "Painel da carteira"],
    ["carteira", allScope ? "Todas as carteiras" : "Minha carteira"],
    ["disponiveis", "Empresas disponíveis"],
    ["solicitacoes", "Solicitações de Carteira"],
    ["kanban", "Kanban"],
    ["historico", "Histórico e auditoria"],
    [
      "notificacoes",
      `Notificações (${data.notifications.filter((n) => !n.read_at).length})`,
    ],
  ];
  const companyName = (id: string) =>
    data.companies.find((c) => c.id === id)?.company_name ||
    "Empresa da solicitação";
  const pendingRequests = data.requests.filter((r) => r.status === "pending");
  const transfersMonth = data.history.filter(
    (h) =>
      h.kind === "assignment" && h.reason !== "Cadastro inicial" && h.reason !== "Responsável preservado na implantação" && h.reason !== "Vínculo legado preservado" &&
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
      }).format(new Date(h.created_at)) ===
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
        }).format(new Date()),
  ).length;
  function exportCsv() {
    const headings = [
      "Empresa",
      "Consultor responsável",
      "Cidade",
      "Convênio",
      "Relacionamento",
      "Saúde",
      "Ciclo atual",
      "Última ação",
      "Data",
      "Ciclo da última ação",
      "Ação no ciclo",
      "Próxima ação",
    ];
    const content = [
      headings,
      ...rows.map((c) => [
        c.company_name,
        c.owner_name,
        c.cidade || "",
        c.agreement_status,
        relationshipLabel(c),
        c.relationship_health,
        c.current_cycle.code,
        c.last_action_type || "",
        c.last_action_date || "",
        c.last_action_cycle?.code || "",
        c.has_action_current_cycle ? "Sim" : "Não",
        c.has_next_action ? "Sim" : "Não",
      ]),
    ]
      .map((r) =>
        r
          .map(
            (s) =>
              `"${String(s)
                .replace(/"/g, '""')
                .replace(/^[=+@-]/, "'$&")}"`,
          )
          .join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
        new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `carteira-b2b-${data.cycle.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function actions(c: PortfolioCompany) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/?company=${c.id}`} className={secondary}>
          Abrir ficha
        </Link>
        {data.actor.manager && (
          <button
            className={secondary}
            onClick={() => setTransfer({ company: c })}
          >
            Transferir empresa
          </button>
        )}
        {data.actor.canRequest &&
          c.owner_id !== data.actor.id &&
          availableCompany(c) && (
            <button
              className={button}
              disabled={c.pending_request}
              onClick={() => setRequest(c)}
            >
              {c.pending_request
                ? "Solicitação pendente"
                : "Solicitar atendimento"}
            </button>
          )}
      </div>
    );
  }
  function companyCard(c: PortfolioCompany) {
    return (
      <article
        key={c.id}
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <h3 className="break-words font-semibold text-slate-900">
          {c.company_name}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {c.cidade || "Cidade não informada"} ·{" "}
          {c.segmento || "Segmento não informado"}
        </p>
        <p className="my-2 text-sm">
          Consultor responsável: <strong>{c.owner_name}</strong>
        </p>
        <CompanyRelationship company={c} />
        <p className="mt-2 text-xs text-slate-600">
          Ciclo {c.current_cycle.code} · Última ação:{" "}
          {c.last_action_type || "Nenhuma"} · {brDate(c.last_action_date)}
          {c.last_action_cycle ? ` · ${c.last_action_cycle.code}` : ""}
        </p>
        {!c.has_action_current_cycle && (
          <p className="mt-2 text-xs text-amber-800">
            Sem ação válida no ciclo {c.current_cycle.code}
            {c.at_risk ? ` · ${c.days_to_cycle_end} dias para encerrar` : ""}
          </p>
        )}
        {tab === "disponiveis" && (
          <p className="mt-2 text-xs text-slate-500">
            Último responsável: {c.last_owner_name || c.owner_name} · Sem relacionamento há {c.days_inactive ?? 0} dias · Última ação há{" "}
            {c.days_since_action ?? "—"} dias
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          {c.has_next_action
            ? "Próxima ação agendada"
            : "Nenhuma próxima ação agendada"}
        </p>
        {actions(c)}
      </article>
    );
  }
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#88005b]">
            Empresas / B2B
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Gestão de carteiras
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {data.actor.name} · {data.cycle.name} ·{" "}
            <strong>{data.cycle.code}</strong> · {brDate(data.cycle.start)} a{" "}
            {brDate(data.cycle.end)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={secondary} disabled={busy} onClick={refresh}>
            {busy ? "Atualizando…" : "Atualizar"}
          </button>
          <Link href="/?view=empresas" className={secondary}>
            Cadastro de empresas
          </Link>
          {data.actor.manager && (
            <>
              <button className={button} onClick={() => setTransfer({})}>
                Transferir carteira
              </button>
              <button
                className={secondary}
                onClick={() => setTransfer({ departure: true })}
              >
                Desligar consultor da carteira
              </button>
            </>
          )}
        </div>
      </header>
      <nav aria-label="Gestão de carteiras" className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? button : secondary}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      )}
      {tab === "dashboard" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Empresas", metrics.total],
              ["Conveniadas", metrics.agreements],
              ["Relacionamento ativo", metrics.active],
              ["Sem relacionamento ativo", metrics.inactive],
              ["Sem ação no ciclo", metrics.noAction],
              ["Empresas em risco", metrics.risk],
              ["Próxima ação agendada", metrics.next],
              ["Solicitações pendentes", pendingRequests.length],
              ...(allScope
                ? [
                    ["Sem responsável", metrics.unowned],
                    ["Transferências no mês", transfersMonth],
                  ]
                : []),
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">
              Prioridades {allScope ? "da operação" : "da minha carteira"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Criticidade, ação no ciclo e próximo atendimento orientam a ordem.
              O responsável permanece na carteira.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {[...dashboardCompanies]
                .sort((a, b) => a.priority - b.priority)
                .slice(0, 8)
                .map(companyCard)}
            </div>
            {!dashboardCompanies.length && (
              <p className="mt-3 text-sm text-slate-500">
                Sua carteira ainda não possui empresas. Consulte Empresas
                disponíveis.
              </p>
            )}
          </section>
          {allScope && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Distribuição por consultor</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ...data.users.map((u) => ({ id: u.id, name: u.name })),
                  { id: "__unowned", name: "Sem responsável" },
                ].map((u) => {
                  const ownRows = data.companies.filter(
                      (c) => (c.owner_id || "__unowned") === u.id,
                    ),
                    m = portfolioMetrics(ownRows);
                  return (
                    <button
                      key={u.id}
                      className="rounded-lg border border-slate-200 p-3 text-left text-sm"
                      onClick={() => {
                        setOwner(u.id);
                        setTab("carteira");
                      }}
                    >
                      <strong>{u.name}</strong>
                      <p className="mt-1 text-xs text-slate-500">
                        {m.total} empresas · {m.active} ativas · {m.noAction}{" "}
                        sem ação
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {data.actor.manager && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Alertas do ciclo</h2>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Dias para risco
                  <input
                    aria-label="Dias para risco"
                    type="number"
                    min={1}
                    max={90}
                    className={`${field} mt-1`}
                    value={riskDays}
                    onChange={(e) => setRiskDays(Number(e.target.value))}
                  />
                </label>
                <label className="text-sm">
                  Dias para atenção crítica
                  <input
                    aria-label="Dias para atenção crítica"
                    type="number"
                    min={1}
                    max={riskDays}
                    className={`${field} mt-1`}
                    value={criticalDays}
                    onChange={(e) => setCriticalDays(Number(e.target.value))}
                  />
                </label>
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() =>
                    run(() => updatePortfolioSettings(riskDays, criticalDays))
                  }
                >
                  Salvar alertas
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {["carteira", "disponiveis", "kanban"].includes(tab) && (
        <>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs">
              Empresa
              <input
                aria-label="Filtrar empresa"
                className={`${field} mt-1`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, cidade ou segmento"
              />
            </label>
            {allScope && (
              <label className="text-xs">
                Consultor
                <select
                  aria-label="Filtrar consultor"
                  className={`${field} mt-1`}
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="__unowned">Sem responsável</option>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs">
              Cidade
              <select
                aria-label="Filtrar cidade"
                className={`${field} mt-1`}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">Todas</option>
                {[
                  ...new Set(
                    data.companies.map((c) => c.cidade).filter(Boolean),
                  ),
                ].map((v) => (
                  <option key={v} value={v!}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Convênio
              <select
                aria-label="Filtrar convênio"
                className={`${field} mt-1`}
                value={agreement}
                onChange={(e) => setAgreement(e.target.value)}
              >
                <option value="">Todos</option>
                {[
                  "Mapeada",
                  "Em negociação",
                  "Conveniada",
                  "Não conveniada",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Relacionamento
              <select
                aria-label="Filtrar relacionamento"
                className={`${field} mt-1`}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="active">Ativo</option>
                <option value="inactive">Sem relacionamento ativo</option>
              </select>
            </label>
            <label className="text-xs">
              Ciclo da última ação
              <select
                aria-label="Filtrar ciclo"
                className={`${field} mt-1`}
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
              >
                <option value="">Todos</option>
                {[
                  ...new Set([
                    data.cycle.code,
                    ...data.companies
                      .map((c) => c.last_action_cycle?.code)
                      .filter(Boolean),
                  ]),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Tipo da última ação
              <select
                aria-label="Filtrar tipo de ação"
                className={`${field} mt-1`}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="">Todos</option>
                {[
                  ...new Set(
                    data.companies
                      .map((c) => c.last_action_type)
                      .filter(Boolean),
                  ),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Última ação desde
              <input
                aria-label="Última ação desde"
                type="date"
                className={`${field} mt-1`}
                value={since}
                onChange={(e) => setSince(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Última ação até
              <input
                aria-label="Última ação até"
                type="date"
                className={`${field} mt-1`}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                className={secondary}
                onClick={() => {
                  setQuery("");
                  setOwner("");
                  setCity("");
                  setAgreement("");
                  setRelationship("");
                  setCycle("");
                  setKind("");
                  setSince("");
                  setUntil("");
                }}
              >
                Limpar filtros
              </button>
              <button className={secondary} onClick={exportCsv}>
                Exportar CSV
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {rows.length} empresas encontradas
            {tab === "disponiveis"
              ? ". Convênios e responsáveis anteriores são preservados até a decisão do gerente."
              : ""}
          </p>
          {tab === "kanban" ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={byOwner}
                  onChange={(e) => setByOwner(e.target.checked)}
                />
                Por consultor
              </label>
              <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(byOwner
                  ? [
                      ...new Set(rows.map((c) => c.owner_name)),
                      "Sem responsável",
                    ].filter((v, i, a) => a.indexOf(v) === i)
                  : columns
                ).map((col) => {
                  const cards = rows.filter((c) =>
                    byOwner
                      ? c.owner_name === col
                      : relationshipColumn(c) === col,
                  );
                  return (
                    <section
                      key={col}
                      className="min-w-0 rounded-xl bg-slate-100 p-3"
                    >
                      <h2 className="mb-3 font-semibold text-slate-700">
                        {col}{" "}
                        <span className="text-xs text-slate-500">
                          {cards.length}
                        </span>
                      </h2>
                      <div className="space-y-3">{cards.map(companyCard)}</div>
                    </section>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map(companyCard)}
            </div>
          )}
          {!rows.length && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Nenhuma empresa corresponde aos filtros.
            </p>
          )}
        </>
      )}
      {tab === "solicitacoes" && (
        <section className="space-y-3">
          <h2 className="font-semibold">
            {data.actor.manager
              ? "Solicitações para análise"
              : "Minhas solicitações"}
          </h2>
          {data.requests.map((r) => {
            const c = data.companies.find((c) => c.id === r.company_id);
            return (
              <article
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">
                    {r.company_name || companyName(r.company_id)}
                  </h3>
                  <span className="text-sm">{REQUEST_LABELS[r.status]}</span>
                </div>
                <p className="mt-2 text-sm">
                  Solicitante: <strong>{r.requested_by_name}</strong> ·
                  Consultor anterior:{" "}
                  {r.previous_owner_name || "Sem responsável"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {brDateTime(r.created_at)} ·{" "}
                  {c ? relationshipLabel(c) : "Carteira atualizada"} · Última
                  ação: {c?.last_action_type || "—"} ·{" "}
                  {brDate(c?.last_action_date)} · Ciclo{" "}
                  {c?.last_action_cycle?.code || "—"}
                </p>
                <p className="mt-2 text-sm">Motivo: {r.reason}</p>
                {r.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {r.notes}
                  </p>
                )}
                {r.reviewed_at && (
                  <p className="mt-2 text-xs text-slate-500">
                    Concluída por {r.reviewed_by_name} em{" "}
                    {brDateTime(r.reviewed_at)}
                    {r.review_notes ? ` · ${r.review_notes}` : ""}
                  </p>
                )}
                {r.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    {data.actor.manager && (
                      <>
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => {
                            setReview({ id: r.id, status: "approved" });
                            setReviewNotes("");
                          }}
                        >
                          Aprovar
                        </button>
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() => {
                            setReview({ id: r.id, status: "rejected" });
                            setReviewNotes("");
                          }}
                        >
                          Recusar
                        </button>
                      </>
                    )}
                    {r.requested_by === data.actor.id && (
                      <button
                        className={secondary}
                        disabled={busy}
                        onClick={() => run(() => cancelAssignmentRequest(r.id))}
                      >
                        Cancelar minha solicitação
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!data.requests.length && (
            <p className="text-sm text-slate-500">
              Nenhuma solicitação registrada.
            </p>
          )}
        </section>
      )}
      {tab === "historico" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Histórico permanente</h2>
          {data.history.map((h) => (
            <article
              key={h.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <h3 className="font-semibold">{companyName(h.company_id)}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {brDateTime(h.created_at)} · {h.changed_by_name}
              </p>
              <p className="mt-2 text-sm">
                {h.kind === "assignment"
                  ? `${h.previous_value.name || "Sem responsável"} → ${h.new_value.name || "Sem responsável"}`
                  : h.kind === "relationship"
                    ? `${h.previous_value.status === "active" ? "Ativo" : "Sem relacionamento ativo"} → ${h.new_value.status === "active" ? "Ativo" : "Sem relacionamento ativo"}`
                    : `${h.previous_value.status ? REQUEST_LABELS[h.previous_value.status as keyof typeof REQUEST_LABELS] : "Nova solicitação"} → ${REQUEST_LABELS[h.new_value.status as keyof typeof REQUEST_LABELS] || ""}`}
              </p>
              <p className="mt-1 text-sm">{h.reason}</p>
              {Boolean(h.new_value.activity) && (
                <p className="mt-1 text-xs text-slate-500">
                  {String(
                    (h.new_value.activity as Record<string, unknown>).type ||
                      "",
                  )}{" "}
                  ·{" "}
                  {String(
                    (h.new_value.activity as Record<string, unknown>).name ||
                      "",
                  )}{" "}
                  · Ciclo{" "}
                  {String(
                    (
                      (h.new_value.activity as Record<string, unknown>)
                        .cycle as Record<string, unknown>
                    )?.code || "",
                  )}
                </p>
              )}
              {h.notes && (
                <p className="mt-1 text-sm text-slate-600">{h.notes}</p>
              )}
            </article>
          ))}
          {!data.history.length && (
            <p className="text-sm text-slate-500">
              Nenhuma movimentação registrada.
            </p>
          )}
        </section>
      )}
      {tab === "notificacoes" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Notificações internas</h2>
          {data.notifications.map((n) => (
            <article
              key={n.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${n.read_at ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"}`}
            >
              <div>
                <p className="text-sm">{n.message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {brDateTime(n.created_at)}
                </p>
              </div>
              {!n.read_at && (
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() => run(() => markPortfolioNotificationRead(n.id))}
                >
                  Marcar como lida
                </button>
              )}
            </article>
          ))}
          {!data.notifications.length && (
            <p className="text-sm text-slate-500">Nenhuma notificação.</p>
          )}
        </section>
      )}
      {transfer && (
        <TransferDialog
          companies={data.companies}
          users={data.users}
          initialCompany={transfer.company}
          departure={transfer.departure}
          onClose={() => setTransfer(null)}
          onDone={refresh}
        />
      )}
      {request && (
        <RequestDialog
          company={request}
          actorName={data.actor.name}
          onClose={() => setRequest(null)}
          onDone={refresh}
        />
      )}
      {review && (
        <PortfolioDialog
          title={
            review.status === "approved"
              ? "Aprovar solicitação"
              : "Recusar solicitação"
          }
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <p className="text-sm">
            {review.status === "approved"
              ? "A empresa será atribuída ao solicitante e continuará sem relacionamento ativo até uma ação comercial válida."
              : "A solicitação será recusada e permanecerá no histórico."}
          </p>
          <label className="mt-3 block text-sm">
            Observação da decisão
            <textarea
              aria-label="Observação da decisão"
              className={`${field} mt-1`}
              rows={3}
              maxLength={5000}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </label>
          {notice && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {notice}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              className={secondary}
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Voltar
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={async () => {
                const ok = await run(() =>
                  reviewAssignmentRequest(
                    review.id,
                    review.status,
                    reviewNotes,
                  ),
                );
                if (ok) setReview(null);
              }}
            >
              {busy ? "Salvando…" : "Confirmar decisão"}
            </button>
          </div>
        </PortfolioDialog>
      )}
    </div>
  );
}
