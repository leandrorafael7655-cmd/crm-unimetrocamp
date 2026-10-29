# Rastreabilidade dos 17 achados

Estado após as decisões de 28/10. Os dez achados corrigidos conservam as evidências anteriores; as novas regras comerciais têm testes locais e aguardam aceite da versão oficial. A futura distribuição da escala não bloqueia o PR.

| Achado | Prioridade | Situação | Implementação/teste |
|---|---|---|---|
| SEC-01 | P0 | corrigido e validado | app/actions/user-admin.ts, supabase/migrations/20261027204357_audit_access_security.sql, lib/auth/admin-compat.test.ts |
| SCHOOL-02 | P0 | corrigido e validado | app/actions/high-school.ts, supabase/migrations/20261027204641_audit_atomic_writes.sql, lib/testing/audit-remediation.test.ts |
| ROUTE-01 | P0 | corrigido e validado | supabase/migrations/20261027204641_audit_atomic_writes.sql, supabase/migrations/20261027212751_audit_optional_route_return.sql, lib/testing/audit-remediation.test.ts |
| ACCESS-01 | P1 | corrigido e validado | app/actions/team.ts, supabase/migrations/20261027204357_audit_access_security.sql, lib/testing/audit-remediation.test.ts |
| ACCESS-02 | P1 | implementado com validação pendente | app/actions/user-admin.ts, app/actions/user-access.ts, Troca obrigatória no Auth real |
| SAVE-01 | P1 | corrigido e validado | components/crm-app.jsx, supabase/migrations/20261027204755_audit_b2b_writes.sql, lib/testing/audit-remediation.test.ts |
| SCHOOL-01 | P1 | corrigido e validado | supabase/migrations/20261027204658_audit_business_validation.sql, supabase/migrations/20261027210239_audit_schedule_identity_guards.sql, lib/domain/attendance-planning.test.ts |
| GOALS-01 | P1 | corrigido e validado | app/gestao/configuracoes/page.tsx, lib/data/goals-queries.ts, lib/testing/audit-remediation.test.ts |
| SEC-DEP | P1 | corrigido e validado | app/globals.css, app/vendor/shadcn.css, npm test |
| DUP-01 | P2 | corrigido e validado | lib/domain/utils.test.ts, supabase/migrations/20261027204658_audit_business_validation.sql, CNPJ alfanumérico oficial 00.000.000/E08G-12 |
| AGENDA-02 | P1 | implementado com validação pendente | supabase/migrations/20261027204658_audit_business_validation.sql, supabase/migrations/20261028183718_audit_unified_external_agenda.sql, lib/testing/final-decisions.test.ts |
| OPS-01 | P1 | decisão comercial pendente | components/attendance/attendance-board.tsx, supabase/migrations/20261027204806_audit_attendance_rules.sql, Consulta atual somente leitura |
| METRIC-01 | P2 | implementado com validação pendente | app/dashboard/page.tsx, supabase/migrations/20261028183704_audit_manual_b2b_goals.sql, lib/testing/final-decisions.test.ts |
| INT-01 | P2 | dependência externa | lib/calendar/calendar-dispatch.ts, docs/audit/2026-10-27/deployment.md, Projeções e fila reais no banco |
| AGENDA-01 | P2 | implementado com validação pendente | docs/audit/2026-10-27/README.md, lib/domain/company-agenda.ts, lib/testing/final-decisions.test.ts |
| PERF-01 | P2 | corrigido e validado | lib/data/goals-queries.ts, lib/auth/guards.ts, lib/data/goals-batching.test.ts |
| QA-01 | P2 | implementado com validação pendente | tests/responsive/fixtures.mjs, scripts/audit/browser-mapbox.mjs, MAPBOX-MOBILE-REAL |

Critérios de aceite, conclusão individual, arquivos e evidências completos: [`execution.json`](../2026-10-27/execution.json). Matriz de 47 funcionalidades: [`matrix-updated.md`](../2026-10-27/matrix-updated.md). A descrição do PR vincula o CI à revisão exata, sem reaproveitar números de outra versão.
