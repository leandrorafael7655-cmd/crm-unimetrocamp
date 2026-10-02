export interface CommercialCycle {
  code: string;
  name: string;
  start: string;
  end: string;
  year: number;
  number: number;
  ordinal: number;
}
export interface PortfolioCompany {
  id: string;
  company_name: string;
  razao_social: string;
  nome_fantasia: string | null;
  owner_id: string | null;
  owner_name: string;
  last_owner_name?: string | null;
  cidade: string | null;
  segmento: string | null;
  agreement_status: string;
  effective_relationship: "active" | "inactive";
  relationship_changed_at: string;
  relationship_health: string;
  current_cycle: CommercialCycle;
  last_action_id: string | null;
  last_action_source: string | null;
  last_action_type: string | null;
  last_action_date: string | null;
  last_action_user: string | null;
  last_action_cycle: CommercialCycle | null;
  has_action_current_cycle: boolean;
  has_next_action: boolean;
  pending_request: boolean;
  at_risk: boolean;
  days_to_cycle_end: number;
  days_since_action: number | null;
  days_inactive: number | null;
  priority: number;
  data_proxima_acao: string | null;
  proxima_acao: string | null;
  next_action_location: string | null;
  risk_days: number;
  critical_days: number;
}
export interface PortfolioUser {
  id: string;
  name: string;
  active: boolean;
  role: string;
}
export interface AssignmentRequest {
  company_name?: string;
  id: string;
  company_id: string;
  requested_by: string;
  requested_by_name: string;
  previous_owner_id: string | null;
  previous_owner_name: string | null;
  reason: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}
export interface PortfolioHistory {
  id: string;
  company_id: string;
  kind: "assignment" | "relationship" | "request";
  previous_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  reason: string;
  notes: string | null;
  changed_by_name: string;
  created_at: string;
}
export interface PortfolioNotification {
  id: string;
  company_id: string | null;
  kind: string;
  message: string;
  read_at: string | null;
  created_at: string;
}
export interface PortfolioData {
  actor: {
    id: string;
    name: string;
    manager: boolean;
    supervisor: boolean;
    canRequest: boolean;
  };
  companies: PortfolioCompany[];
  users: PortfolioUser[];
  requests: AssignmentRequest[];
  history: PortfolioHistory[];
  notifications: PortfolioNotification[];
  cycle: CommercialCycle;
}
export const TRANSFER_REASONS = [
  "Desligamento",
  "Redistribuição",
  "Solicitação de atendimento",
  "Empresa sem relacionamento ativo",
  "Alteração de região",
  "Gestão comercial",
  "Férias / afastamento",
  "Outro",
];
export const REQUEST_REASONS = [
  "Possuo contato",
  "Identifiquei oportunidade",
  "Empresa da minha região",
  "Tenho relacionamento com o responsável",
  "Interesse em desenvolver a conta",
  "Outro",
];
export const REQUEST_LABELS = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
};
export const relationshipLabel = (c: PortfolioCompany) =>
  c.effective_relationship === "active"
    ? "Relacionamento ativo"
    : "Sem relacionamento ativo";
export const availableCompany = (c: PortfolioCompany) =>
  !c.owner_id || c.effective_relationship === "inactive";
export function portfolioMetrics(companies: PortfolioCompany[]) {
  return {
    total: companies.length,
    agreements: companies.filter((c) => c.agreement_status === "Conveniada")
      .length,
    active: companies.filter((c) => c.effective_relationship === "active")
      .length,
    inactive: companies.filter((c) => c.effective_relationship === "inactive")
      .length,
    unowned: companies.filter((c) => !c.owner_id).length,
    noAction: companies.filter((c) => !c.has_action_current_cycle).length,
    risk: companies.filter((c) => c.at_risk).length,
    next: companies.filter((c) => c.has_next_action).length,
  };
}
export function relationshipColumn(c: PortfolioCompany) {
  if (c.pending_request) return "Solicitação pendente";
  if (!c.owner_id) return "Sem responsável";
  if (c.effective_relationship === "inactive")
    return "Sem relacionamento ativo";
  if (!c.has_action_current_cycle) return "Atenção";
  return "Relacionamento ativo";
}
export const brDate = (s: string | null | undefined) =>
  s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
export const brDateTime = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(s));
