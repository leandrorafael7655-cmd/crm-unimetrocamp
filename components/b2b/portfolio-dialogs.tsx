"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { requestCompany, transferCompanies } from "@/app/actions/b2b-portfolio";
import {
  portfolioMetrics,
  REQUEST_REASONS,
  TRANSFER_REASONS,
  type PortfolioCompany,
  type PortfolioUser,
} from "@/lib/b2b-portfolio/domain";

export const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100";
export const button =
  "rounded-lg bg-[#88005b] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
export const secondary =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50";
export function PortfolioDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={event => { event.preventDefault(); onClose() }}
      aria-label={title}
      className="m-auto max-h-[90dvh] w-[min(56rem,95vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl backdrop:bg-slate-950/45 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className={secondary}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function TransferDialog({
  companies,
  users,
  initialCompany,
  departure = false,
  onClose,
  onDone,
}: {
  companies: PortfolioCompany[];
  users: PortfolioUser[];
  initialCompany?: PortfolioCompany;
  departure?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [source, setSource] = useState(initialCompany?.owner_id || "__unowned");
  const [selection, setSelection] = useState<string[]>(
    initialCompany ? [initialCompany.id] : [],
  );
  const [target, setTarget] = useState("");
  const [split, setSplit] = useState(departure);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(
    departure ? "Desligamento" : "Redistribuição",
  );
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sourceRows = initialCompany
    ? [initialCompany]
    : companies.filter((c) => (c.owner_id || "__unowned") === source);
  const rows = sourceRows.filter((c) => selection.includes(c.id));
  const counts = portfolioMetrics(sourceRows);
  const targets = users.filter((u) => u.active && u.id !== source);
  const distribution = rows.reduce<Record<string, number>>((all, c) => {
    const id = split ? destinations[c.id] : target;
    if (id) all[id] = (all[id] || 0) + 1;
    return all;
  }, {});
  function changeSource(value: string) {
    setSource(value);
    setSelection(
      companies
        .filter((c) => (c.owner_id || "__unowned") === value)
        .map((c) => c.id),
    );
    setTarget("");
    setDestinations({});
    setReview(false);
  }
  function reviewTransfer() {
    setError("");
    if (!rows.length) return setError("Selecione pelo menos uma empresa.");
    if (rows.some((c) => !(split ? destinations[c.id] : target)))
      return setError("Defina um destino para cada empresa selecionada.");
    setReview(true);
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const result = await transferCompanies(
        rows.map((c) => ({
          companyId: c.id,
          expectedOwnerId: c.owner_id,
          newOwnerId: split ? destinations[c.id] : target,
        })),
        reason,
        notes,
      );
      if (!result.ok) {
        setError(result.message);
        setReview(false);
        return;
      }
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <PortfolioDialog
      title={
        initialCompany
          ? "Transferir empresa"
          : departure
            ? "Desligar consultor da carteira"
            : "Transferir carteira"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {initialCompany ? (
        <p className="mb-4 text-sm">
          <strong>{initialCompany.company_name}</strong>
          <br />
          Responsável atual: {initialCompany.owner_name}
        </p>
      ) : (
        <label className="block text-sm">
          Consultor atual
          <select
            aria-label="Consultor atual"
            className={`${field} mt-1`}
            value={source}
            onChange={(e) => changeSource(e.target.value)}
            disabled={review || busy}
          >
            <option value="__unowned">Sem responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {!u.active ? " (inativo)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="my-3 rounded-lg bg-slate-50 p-3 text-sm">
        Carteira de origem: <strong>{counts.total}</strong> empresas ·{" "}
        {counts.agreements} conveniadas · {counts.active} ativas ·{" "}
        {counts.inactive} sem relacionamento · {counts.noAction} sem ação no
        ciclo.
      </p>
      {!review && (
        <>
          {!initialCompany && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                className={secondary}
                onClick={() => setSelection(sourceRows.map((c) => c.id))}
              >
                Transferir todas
              </button>
              <button className={secondary} onClick={() => setSelection([])}>
                Selecionar empresas específicas
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={split}
                  onChange={(e) => setSplit(e.target.checked)}
                />
                Dividir entre consultores
              </label>
            </div>
          )}
          {!split && (
            <label className="block text-sm">
              Novo responsável
              <select
                aria-label="Novo responsável"
                className={`${field} mt-1`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Selecione</option>
                {targets.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!initialCompany && (
            <div className="my-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              <p className="p-2 text-xs text-slate-500">
                {selection.length} empresas selecionadas
              </p>
              {sourceRows.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-2"
                >
                  <label className="min-w-0 flex-1 text-sm">
                    <input
                      type="checkbox"
                      checked={selection.includes(c.id)}
                      onChange={(e) =>
                        setSelection(
                          e.target.checked
                            ? [...selection, c.id]
                            : selection.filter((id) => id !== c.id),
                        )
                      }
                    />{" "}
                    <span>{c.company_name}</span>
                  </label>
                  {split && selection.includes(c.id) && (
                    <select
                      aria-label={`Destino de ${c.company_name}`}
                      className={`${field} sm:max-w-64`}
                      value={destinations[c.id] || ""}
                      onChange={(e) =>
                        setDestinations({
                          ...destinations,
                          [c.id]: e.target.value,
                        })
                      }
                    >
                      <option value="">Selecionar destino</option>
                      {targets.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
          <label className="mt-3 block text-sm">
            Motivo da transferência
            <select
              aria-label="Motivo da transferência"
              className={`${field} mt-1`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {TRANSFER_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Observação
            <textarea
              aria-label="Observação da transferência"
              className={`${field} mt-1`}
              rows={3}
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </>
      )}
      {review && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">
            Você está transferindo {rows.length} empresas de{" "}
            {initialCompany?.owner_name ||
              users.find((u) => u.id === source)?.name ||
              "Sem responsável"}
            .
          </p>
          <ul className="my-2 space-y-1">
            {Object.entries(distribution).map(([id, count]) => (
              <li key={id}>
                {users.find((u) => u.id === id)?.name}:{" "}
                <strong>{count} empresas</strong>
              </li>
            ))}
          </ul>
          <p>Motivo: {reason}</p>
          {notes && <p className="mt-1">{notes}</p>}
          <p className="mt-2">
            O histórico, os contatos, os convênios e os participantes das ações
            serão preservados.
          </p>
          {departure && (
            <p className="mt-2">
              Após redistribuir toda a carteira, desative o acesso em Gestão de
              usuários.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          className={secondary}
          disabled={busy}
          onClick={() => (review ? setReview(false) : onClose())}
        >
          {review ? "Voltar" : "Cancelar"}
        </button>
        <button
          className={button}
          disabled={busy}
          onClick={review ? confirm : reviewTransfer}
        >
          {busy
            ? "Transferindo…"
            : review
              ? "Confirmar transferência"
              : "Revisar transferência"}
        </button>
      </div>
    </PortfolioDialog>
  );
}
export function RequestDialog({
  company,
  actorName,
  onClose,
  onDone,
}: {
  company: PortfolioCompany;
  actorName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(REQUEST_REASONS[0]),
    [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    try {
      const r = await requestCompany(company.id, reason, notes);
      if (!r.ok) return setError(r.message);
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <PortfolioDialog
      title="Solicitar atendimento"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="mb-4 text-sm">
        <strong>{company.company_name}</strong>
        <br />
        Consultor solicitante: {actorName}
      </p>
      <label className="block text-sm">
        Motivo
        <select
          aria-label="Motivo da solicitação"
          className={`${field} mt-1`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REQUEST_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm">
        Observação
        <textarea
          aria-label="Observação da solicitação"
          className={`${field} mt-1`}
          rows={3}
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="mt-3 text-xs text-slate-500">
        O Gerente Comercial analisará a solicitação. A empresa só mudará de
        responsável após a aprovação.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className={secondary} disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button className={button} disabled={busy} onClick={submit}>
          {busy ? "Enviando…" : "Enviar solicitação"}
        </button>
      </div>
    </PortfolioDialog>
  );
}
