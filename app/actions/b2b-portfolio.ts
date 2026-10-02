"use server";

import { revalidatePath } from "next/cache";
import { requireActor, requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { profileDisplayName } from "@/lib/domain/user-display";
import { assertUuid } from "@/lib/meetings/domain";
import { saoPauloToday } from "@/lib/domain/school-agenda";
import {
  availableCompany,
  type CommercialCycle,
  type PortfolioCompany,
  type PortfolioData,
} from "@/lib/b2b-portfolio/domain";

const errorMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : (e as { message?: string })?.message ||
      "Não foi possível concluir a operação.";
async function allRows<T>(
  table: string,
  order: string,
  filter?: { key: string; value: string },
) {
  const client = await createClient();
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = client
      .from(table)
      .select("*")
      .order(order)
      .order("id")
      .range(offset, offset + 499);
    if (filter) query = query.eq(filter.key, filter.value);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as unknown as T[]));
    if (data.length < 500) return rows;
  }
}

export async function loadPortfolio(companyId?: string) {
  try {
    const actor = await requireActor();
    if (companyId) assertUuid(companyId);
    const client = await createClient();
    const { error: reviewError } = await client.rpc("b2b_review_portfolio");
    if (reviewError) throw reviewError;
    const filter = companyId
      ? { key: "company_id", value: companyId }
      : undefined;
    const [companies, users, requests, history, notifications, cycleResult] =
      await Promise.all([
        allRows<PortfolioCompany>(
          "b2b_company_portfolio",
          "company_name",
          companyId ? { key: "id", value: companyId } : undefined,
        ),
        client
          .from("profiles")
          .select("id,full_name,consultant_tag,active,role")
          .in("role", ["gerente", "supervisor", "consultor_b2b", "consultor"]),
        allRows<PortfolioData["requests"][number]>(
          "company_assignment_requests",
          "created_at",
          filter,
        ),
        allRows<PortfolioData["history"][number]>(
          "company_portfolio_history",
          "created_at",
          filter,
        ),
        allRows<PortfolioData["notifications"][number]>(
          "company_portfolio_notifications",
          "created_at",
        ),
        client.rpc("b2b_commercial_cycle", {
          p_date: saoPauloToday(),
        }),
      ]);
    if (users.error || cycleResult.error)
      throw users.error || cycleResult.error;
    const manager = actor.role === "gerente",
      supervisor = actor.role === "supervisor";
    const scoped =
      companyId || manager || supervisor || actor.role === "high_school"
        ? companies
        : companies.filter(
            (c) => c.owner_id === actor.id || availableCompany(c),
          );
    const visible = new Set(scoped.map((c) => c.id));
    return {
      ok: true as const,
      data: {
        actor: {
          id: actor.id,
          name: actor.full_name,
          manager,
          supervisor,
          canRequest: actor.role !== "high_school",
        },
        companies: scoped,
        users: (users.data || []).map((p) => ({
          id: p.id,
          name: profileDisplayName(p),
          active: p.active,
          role: p.role,
        })),
        requests: requests.map((r) => ({
          ...r,
          company_name:
            companies.find((c) => c.id === r.company_id)?.company_name ||
            "Empresa da solicitação",
        })),
        history: history.filter((h) => visible.has(h.company_id)).reverse(),
        notifications: notifications.reverse(),
        cycle: cycleResult.data as unknown as CommercialCycle,
      } satisfies PortfolioData,
    };
  } catch (e) {
    return { ok: false as const, message: errorMessage(e) };
  }
}

async function command(
  name: string,
  payload: Record<string, unknown>,
  manager = false,
) {
  try {
    if (manager) await requireRole("gerente");
    else await requireActor();
    const client = await createClient();
    const { data, error } = await client.rpc("b2b_portfolio_command", {
      p_command: name,
      p_payload: payload,
    });
    if (error) throw error;
    for (const path of ["/", "/dashboard", "/b2b/carteira"])
      revalidatePath(path);
    return {
      ok: true as const,
      data,
      message: "Operação registrada com sucesso.",
    };
  } catch (e) {
    return { ok: false as const, message: errorMessage(e) };
  }
}
export async function transferCompanies(
  assignments: {
    companyId: string;
    expectedOwnerId: string | null;
    newOwnerId: string;
  }[],
  reason: string,
  notes: string,
) {
  return command("transfer", { assignments, reason, notes }, true);
}
export async function requestCompany(
  companyId: string,
  reason: string,
  notes: string,
) {
  return command("request", { companyId, reason, notes });
}
export async function reviewAssignmentRequest(
  id: string,
  status: "approved" | "rejected",
  notes: string,
) {
  return command("review_request", { id, status, notes }, true);
}
export async function cancelAssignmentRequest(id: string) {
  return command("cancel_request", { id });
}
export async function markPortfolioNotificationRead(id: string) {
  return command("mark_read", { id });
}
export async function updatePortfolioSettings(
  riskDays: number,
  criticalDays: number,
) {
  return command("settings", { riskDays, criticalDays }, true);
}
