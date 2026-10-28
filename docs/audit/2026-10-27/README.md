# Correções da auditoria UniConecta — 27/10/2026

A entrega corrige a origem dos problemas de autorização, perda parcial de dados e persistência no código e no banco isolado. Produção não foi alterada, publicada ou migrada. Merge e liberação definitiva continuam para revisão do responsável.

## Projeto e ambientes confirmados

- Repositório: `leandrorafael7655-cmd/crm-unimetrocamp`; base auditada e `main` conferida: `0a2bc72db9b666d241b616bc7803efbc15f0ee4d`. Branch própria: `codex/fix-audit-20261027`. Nenhuma correção nova foi encontrada entre essa base e a versão auditada antes do trabalho. Checkout original e suas alterações locais foram preservados em worktree separado.
- Arquitetura: Next.js App Router/React, Server Actions, Supabase Auth/PostgreSQL/RLS e Edge Functions de calendário, Vercel. Há demo com localStorage, explicitamente identificado, e funcionamento conectado ao banco. O layout atual e os cinco grupos existentes foram reaproveitados; não houve novo design.
- Oficial: Vercel `unimetrocamp`/`uniconecta-crm.vercel.app`, Supabase `snixwajvzaxldglcwnig`. Homologação criada sem dados oficiais: branch `audit-fixes-20261027`, projeto `ktmcksngmhxtdnxunntl`. Não foi feito merge dessa branch de banco.
- Papéis de autorização encontrados: gerente, supervisor, consultor B2B e High School (com compatibilidade de papel legado). Na base oficial consultada, supervisor e High School não tinham contas representativas próprias; a homologação usou esses papéis explicitamente para testar as permissões já implementadas. FDV e SM não receberam papéis novos nem poderes gerenciais.
- Relatório completo, ZIP e matriz original foram lidos; os 17 critérios originais estão preservados em `original-findings.json` e a matriz em `original-matrix.json`.

## Situação dos 17 achados

Os estados abaixo valem para a branch/homologação e seu critério descrito. Uma migração testada não implica que a versão oficial esteja corrigida. Itens com decisão comercial ou dependência externa não foram classificados como concluídos.

| ID | Prioridade | Achado | Situação | Implementação e teste principal |
|---|---|---|---|---|
| SEC-01 | P0 | Autocadastro aceita o papel supervisor | **corrigido e validado** | app/actions/team.ts; SEC-01-METADATA |
| SCHOOL-02 | P0 | Edição escolar pode apagar participantes anteriores | **corrigido e validado** | app/actions/high-school.ts; SCHOOL-02-REAL |
| ROUTE-01 | P0 | Edição de rota pode eliminar todas as paradas | **corrigido e validado** | app/actions/routes.ts; ROUTE-01-REAL |
| ACCESS-01 | P1 | Supervisor pode rebaixar o único gerente | **corrigido e validado** | app/actions/user-admin.ts; Concorrência PostgreSQL real com duas transações |
| ACCESS-02 | P1 | Redefinição legada ignora as regras atuais | **implementado com validação pendente** | app/actions/team.ts; lib/auth/admin-compat.test.ts |
| SAVE-01 | P1 | B2B pode aparentar salvar sem gravar | **corrigido e validado** | lib/data/supabase-storage.ts; SAVE-01-REAL |
| SCHOOL-01 | P1 | Ação escolar antiga aceita término anterior ao início | **corrigido e validado** | lib/domain/validation.ts; SCHOOL-01-REAL |
| GOALS-01 | P1 | Central de Metas redireciona consultores autorizados | **corrigido e validado** | app/gestao/layout.tsx; GOALS-01-RLS-REAL |
| SEC-DEP | P1 | Next.js de produção está em faixa afetada | **corrigido e validado** | package.json; pnpm audit --prod --json |
| DUP-01 | P2 | Unicidade de CNPJ depende da pontuação | **corrigido e validado** | lib/domain/utils.ts; DUP-01-REAL |
| AGENDA-02 | P1 | Conflitos de agenda não têm garantia uniforme | **decisão comercial pendente** | lib/domain/validation.ts; AGENDA-02-CONCURRENCY-REAL |
| OPS-01 | P1 | Escala atual ainda não foi publicada | **decisão comercial pendente** | lib/domain/attendance-planning.ts; lib/domain/attendance-planning.test.ts |
| METRIC-01 | P2 | Meta B2B SuperVest retorna zero sem cálculo | **decisão comercial pendente** | lib/data/goals-queries.ts; METRIC-01-BROWSER |
| INT-01 | P2 | Microsoft Graph/Teams não está ativado | **dependência externa** | docs/b2b-outlook-teams.md; Testes de Graph/convites com provedor simulado |
| AGENDA-01 | P2 | Minha Agenda não consolida compromissos B2B | **decisão comercial pendente** | app/actions/attendance.ts; Inspeção da composição atual |
| PERF-01 | P2 | Listas e índices precisam de revisão com volume | **corrigido e validado** | lib/data/pagination.ts; homologation-volume.mjs |
| QA-01 | P2 | Regressão autenticada e reprodução do ambiente são insuficientes | **implementado com validação pendente** | .github/workflows/responsive-layout.yml; Reprodução anterior com código auditado |

### SEC-01 — Autocadastro aceita o papel supervisor

Gatilho ignora metadata de papel/situação e cria B2B inativo. Alterações sensíveis só pelo servidor autorizado. REST, metadata no Auth e remoção indevida da flag de senha foram recusados. Criação do usuário foi exercitada no gatilho real do banco isolado; entrega de convite/cadastro administrativo pelo Admin SDK ainda depende da chave segura desse ambiente.

**Critério original:** Autocadastro com qualquer role privilegiada não cria acesso gerencial; somente gerente autorizado atribui papéis; testes via Auth e RLS com caixa de teste passam.

**Arquivos/migrações:** `app/actions/team.ts`, `app/actions/user-admin.ts`, `supabase/migrations/20261027204357_audit_access_security.sql`.

**Verificação:** SEC-01-METADATA; SEC-01-ACCESS-REAL; lib/testing/audit-remediation.test.ts; lib/auth/admin-compat.test.ts. Evidências: [homologation-auth-results.json](evidence/homologation-auth-results.json), [homologation-data-results.json](evidence/homologation-data-results.json), [homologation-password-results.json](evidence/homologation-password-results.json).

### SCHOOL-02 — Edição escolar pode apagar participantes anteriores

Ação, participantes, resultados e projeções de calendário gravam na mesma transação. Falha de resultado após alterar participantes preservou o estado anterior. Sucesso preservou IDs de resultado e ID/UID do principal; o apoio removido ficou cancelado.

**Critério original:** Falha em qualquer etapa mantém data, participantes e resultados originais; sucesso grava todos e atualiza a agenda; teste autenticado de principal e apoio após recarga.

**Arquivos/migrações:** `app/actions/high-school.ts`, `supabase/migrations/20261027204641_audit_atomic_writes.sql`.

**Verificação:** SCHOOL-02-REAL; SCHOOL-AGENDA-REAL; lib/testing/audit-remediation.test.ts. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json).

### ROUTE-01 — Edição de rota pode eliminar todas as paradas

Plano e paradas são atômicos e mantêm IDs ao reordenar. Falha em parada preservou plano/paradas completos; outro consultor foi bloqueado. A prévia confirmou quatro saídas sem retorno em produção: retorno opcional foi preservado, não tratado como corrupção.

**Critério original:** Falhas de update/delete/insert preservam exatamente a versão anterior; sucesso mantém vínculos e ordem após recarregar e entrar novamente.

**Arquivos/migrações:** `app/actions/routes.ts`, `components/routes/route-planner.tsx`, `supabase/migrations/20261027204641_audit_atomic_writes.sql`, `supabase/migrations/20261027212751_audit_optional_route_return.sql`.

**Verificação:** ROUTE-01-REAL; lib/testing/audit-remediation.test.ts. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json).

### ACCESS-01 — Supervisor pode rebaixar o único gerente

Servidor exige gerente para alterar acesso. Contador privado serializa remoção/desativação/rebaixamento, inclusive cascade/ban no Auth. Duas transações reais concorrentes: uma remoção confirmou; a outra esperou e recebeu 23514, mantendo um gerente ativo. Não depende do botão da interface.

**Critério original:** Supervisor não altera gerente; tentativas concorrentes não deixam zero gerentes; saída de usuários com carteira continua bloqueada.

**Arquivos/migrações:** `app/actions/user-admin.ts`, `app/actions/team.ts`, `supabase/migrations/20261027204357_audit_access_security.sql`.

**Verificação:** Concorrência PostgreSQL real com duas transações; lib/auth/admin-compat.test.ts; lib/testing/audit-remediation.test.ts. Evidências: [manager-concurrency-lock.json](evidence/manager-concurrency-lock.json), [homologation-data-results.json](evidence/homologation-data-results.json).

### ACCESS-02 — Redefinição legada ignora as regras atuais

Entradas legadas delegam ao fluxo atual, exigem gerente, mantêm auditoria e troca obrigatória. Supervisor/B2B/HS bloqueados antes de abrir cliente administrativo. Troca efetiva da própria senha validada no Auth real; geração administrativa e endpoints legítimos completos aguardam a chave administrativa da homologação, sem solicitá-la no chat.

**Critério original:** Todo ponto de entrada bloqueia supervisor/consultores; exige troca após senha temporária e registra operador/resultado sem armazenar senha. Confirmar também o endpoint real em homologação.

**Arquivos/migrações:** `app/actions/team.ts`, `app/actions/user-admin.ts`, `app/actions/user-access.ts`.

**Verificação:** lib/auth/admin-compat.test.ts; lib/auth/user-access*.test.ts; Troca obrigatória no Auth real. Evidências: [homologation-password-results.json](evidence/homologation-password-results.json), [tests.log](evidence/tests.log).

### SAVE-01 — B2B pode aparentar salvar sem gravar

Erros sobem até a interface; estado e modal só confirmam depois da gravação. Empresa/contatos/convênio e interação/próximo passo são transacionais. Navegador real confirmou criação/edição/busca/recarga e preservação de formulário diante de falha do banco. O teste identificou aviso cobrindo o botão Cancelar; a interceptação foi corrigida e o clique faz parte da regressão final.

**Critério original:** Falha de rede, RLS ou unicidade mostra erro, mantém formulário e não exibe registro ficticiamente salvo; sucesso persiste após recarga e novo login.

**Arquivos/migrações:** `lib/data/supabase-storage.ts`, `lib/data/local-storage.ts`, `components/crm-app.jsx`, `supabase/migrations/20261027204755_audit_b2b_writes.sql`.

**Verificação:** SAVE-01-REAL; SAVE-01-BROWSER-PERSISTENCE; SAVE-01-BROWSER-FAILURE; lib/data/persistence.test.ts; lib/testing/audit-remediation.test.ts. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json), [homologation-additional-results.json](evidence/homologation-additional-results.json), [browser-homologation-results.json](evidence/browser-homologation-results.json).

### SCHOOL-01 — Ação escolar antiga aceita término anterior ao início

Cronologia validada em domínio, formulário, servidor e CHECK geral, incluindo ação sem edição. Agendamentos exigem responsável e intervalo completo. Fim igual/anterior recusado pelo banco real. Registros históricos realizados podem continuar somente com data quando permitido.

**Critério original:** Ações antigas e novas recusam fim igual/anterior ao início; horários incompletos seguem regra explícita; dados históricos válidos são preservados.

**Arquivos/migrações:** `lib/domain/validation.ts`, `app/actions/high-school.ts`, `components/high-school/escola-360-panels.tsx`, `supabase/migrations/20261027204658_audit_business_validation.sql`, `supabase/migrations/20261027210239_audit_schedule_identity_guards.sql`.

**Verificação:** SCHOOL-01-REAL; lib/testing/audit-remediation.test.ts; lib/domain/attendance-planning.test.ts. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json).

### GOALS-01 — Central de Metas redireciona consultores autorizados

Layout aceita metas próprias e consulta filtra o ator; configuração mantém acesso gerencial. Acesso B2B e recarga já comprovados no navegador real; matriz final registra individualmente os demais perfis efetivamente concluídos. Consultor não recebeu meta alheia na API real nem acesso a configuração.

**Critério original:** Ambos acessam metas próprias por clique, URL direta e recarga; não leem metas alheias nem alteram configurações.

**Arquivos/migrações:** `app/gestao/layout.tsx`, `app/gestao/metas/page.tsx`, `app/gestao/configuracoes/page.tsx`, `lib/data/goals-queries.ts`.

**Verificação:** GOALS-01-RLS-REAL; GOALS-01-BROWSER-*; lib/auth/config-access.test.ts; lib/testing/audit-remediation.test.ts. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json), [browser-homologation-results.json](evidence/browser-homologation-results.json).

### SEC-DEP — Next.js de produção está em faixa afetada

Next 16.3.0 atualizado para 16.4.1, correção explicitamente indicada no GHSA-p3m5-59mp-jv5r; versões compatíveis e lockfile verificados. CLI shadcn retirada do runtime, preservando exatamente seu CSS com licença. Scanner atual: zero alertas de produção. Publicação permanece para revisão, portanto a versão oficial ainda precisa receber a correção.

**Critério original:** Aviso aplicável eliminado do lockfile/runtime publicado; login, ações e build passam; triagem documentada para alertas restantes.

**Arquivos/migrações:** `package.json`, `pnpm-lock.yaml`, `app/globals.css`, `app/vendor/shadcn.css`.

**Verificação:** pnpm audit --prod --json; npm run build; npm test. Evidências: [dependency-audit.json](evidence/dependency-audit.json), [build.log](evidence/build.log), [tests.log](evidence/tests.log).

### DUP-01 — Unicidade de CNPJ depende da pontuação

Unicidade compara CNPJ canônico, preserva máscara e aceita CNPJ alfanumérico com dígitos verificadores. Banco real recusou duplicata com/sem pontuação. Nenhuma empresa foi fundida ou apagada; vazios continuam opcionais e filial com identificador distinto permanece distinta.

**Critério original:** As duas representações não criam dois registros; campos vazios e regras de filial funcionam; conflitos retornam mensagem clara.

**Arquivos/migrações:** `lib/domain/utils.ts`, `lib/domain/utils.test.ts`, `supabase/migrations/20261027204658_audit_business_validation.sql`.

**Verificação:** DUP-01-REAL; lib/testing/audit-remediation.test.ts; CNPJ alfanumérico oficial 00.000.000/E08G-12. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json), [tests.log](evidence/tests.log).

### AGENDA-02 — Conflitos de agenda não têm garantia uniforme

Conflito escolar de principal/apoio agora tem reserva privada e EXCLUDE no PostgreSQL. Duas requisições reais simultâneas deram um sucesso e uma recusa; adjacência e cancelamento foram testados. Escala bloqueia sobreposição/cobertura insuficiente. Bloqueio global entre escola, reunião B2B, ausência e bloco externo exige definir o que é compromisso exclusivo e o que é bloco que contém uma visita; não foi inventada essa regra.

**Critério original:** Testar principal e apoio, duas sessões simultâneas, intervalos adjacentes, cancelamento e ausência; conflito bloqueia ou exige exceção conforme regra aprovada.

**Arquivos/migrações:** `lib/domain/validation.ts`, `lib/domain/attendance-planning.ts`, `supabase/migrations/20261027204658_audit_business_validation.sql`.

**Verificação:** AGENDA-02-CONCURRENCY-REAL; lib/testing/audit-remediation.test.ts; lib/domain/attendance-planning.test.ts. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json), [tests.log](evidence/tests.log).

### OPS-01 — Escala atual ainda não foi publicada

246 rascunhos e 61 sem usuário reconfirmados. Os 61 são das posições 7 (30) e 8 (31); os demais 185 já têm vínculo correto com os seis nomes confirmados. Prévia por responsável e capacidade 6/7 pessoas entregue. Regras 42h, almoço, 3/2, sábado 13h, GDC e eventos implementadas; nenhuma atribuição ou publicação automática. Preferências, rodízio e GDC continuam decisões operacionais.

**Critério original:** Nenhum horário necessário sem responsável; escala publicada aparece no consultor correto após recarga; nenhum rascunho aparece indevidamente; convites só a destinatários aprovados.

**Arquivos/migrações:** `lib/domain/attendance-planning.ts`, `app/actions/attendance.ts`, `components/attendance/attendance-board.tsx`, `supabase/migrations/20261027204806_audit_attendance_rules.sql`.

**Verificação:** lib/domain/attendance-planning.test.ts; Consulta atual somente leitura. Evidências: [scale-preview.json](evidence/scale-preview.json), [tests.log](evidence/tests.log).

### METRIC-01 — Meta B2B SuperVest retorna zero sem cálculo

Zero fixo de B2B SuperVest substituído por indisponível, inclusive no residual Outros canais e na ausência de snapshot oficial. Zero medido continua zero; falha de consulta não vira zero. Corrigida semana civil de segunda-feira que incluía semana anterior e eliminada consulta de atividades por semana, com leitura paginada única da janela. A fonte/atribuição comercial de inscrições B2B ainda precisa ser confirmada antes de implementar um resultado oficial.

**Critério original:** Dados oficiais fictícios conhecidos produzem total correto; sem integração mostra indisponível; alterações mantêm histórico e não duplicam atribuição.

**Arquivos/migrações:** `lib/data/goals-queries.ts`, `lib/domain/goals.ts`, `components/goals/goal-cards.tsx`, `components/goals/metas-client.tsx`, `components/goals/supervest-client.tsx`, `app/dashboard/page.tsx`.

**Verificação:** METRIC-01-BROWSER; lib/data/goals-availability.test.ts; lib/data/goals-batching.test.ts; lib/domain/goals.test.ts. Evidências: [browser-homologation-results.json](evidence/browser-homologation-results.json), [tests.log](evidence/tests.log).

### INT-01 — Microsoft Graph/Teams não está ativado

Não há tenant/conta Microsoft/variáveis necessárias disponíveis para validação real. Código e testes não comprovam autorização, envio, recebimento ou Teams. Entrega, atualização e cancelamento no Outlook permanecem pendentes de conta/caixa de teste e configuração segura. O dispatcher pode ser desabilitado em homologação sem fingir entrega.

**Critério original:** No modo aprovado, criar/editar/cancelar sem duplicar Event ID e confirmar organizador, destinatários, respostas e persistência com contas de teste.

**Arquivos/migrações:** `docs/b2b-outlook-teams.md`, `lib/calendar/calendar-dispatch.ts`, `docs/audit/2026-10-27/deployment.md`.

**Verificação:** Testes de Graph/convites com provedor simulado; Projeções e fila reais no banco. Evidências: [tests.log](evidence/tests.log), [homologation-data-results.json](evidence/homologation-data-results.json).

### AGENDA-01 — Minha Agenda não consolida compromissos B2B

Confirmado: Minha Agenda agrega escola e atendimento; reuniões B2B têm seu fluxo próprio. Não foi confirmado que toda interação/follow-up B2B deva virar compromisso da agenda única. Integração escolar e seus participantes foram corrigidos/testados; a unificação B2B aguarda escopo, sem duplicar eventos ou conceder leitura gerencial.

**Critério original:** Cenário fictício com escola, atendimento e B2B aparece conforme escopo aprovado, sem duplicação e sem dados de outros consultores.

**Arquivos/migrações:** `app/actions/attendance.ts`, `docs/audit/2026-10-27/README.md`.

**Verificação:** Inspeção da composição atual; SCHOOL-AGENDA-REAL. Evidências: [homologation-data-results.json](evidence/homologation-data-results.json).

### PERF-01 — Listas e índices precisam de revisão com volume

1001 empresas fictícias retornaram em páginas 500/500/1, sem duplicar ou truncar, com RLS real: 433ms nesta execução. Plano administrativo da última página: 0,515ms de execução, separado da medição REST. Consultas de aderência agrupadas, somas escolares paginadas/em lotes e ator deduplicado durante renderização. Avisos de índices não usados em branch nova não justificam apagar índices. Tempos de navegação local são registrados à parte e não são SLA de produção.

**Critério original:** Mais de 1000 registros fictícios retornam contagem e páginas completas; consultas críticas têm planos e tempos registrados; permissões permanecem intactas.

**Arquivos/migrações:** `lib/data/pagination.ts`, `lib/data/supabase-storage.ts`, `lib/data/route-queries.ts`, `lib/data/goals-queries.ts`, `lib/auth/guards.ts`.

**Verificação:** homologation-volume.mjs; EXPLAIN ANALYZE em homologação; lib/data/persistence.test.ts; lib/data/goals-batching.test.ts. Evidências: [homologation-volume-results.json](evidence/homologation-volume-results.json), [homologation-query-plan.json](evidence/homologation-query-plan.json), [tests.log](evidence/tests.log).

### QA-01 — Regressão autenticada e reprodução do ambiente são insuficientes

Ambiente isolado real criado sem dados oficiais; baseline completo sem usuários/dados, grants explícitos, scripts repetíveis e build que não reescreve fontes. Primeira branch revelou falta de grants implícitos; migração 6 corrigiu e os testes autenticados passaram. O CI #26 passou no SHA registrado em `evidence/ci-run-26.json`; restam os fluxos que precisam de Admin SDK/SMTP/Graph. O resultado de cada novo SHA será vinculado no PR. Homologação não foi confundida com produção.

**Critério original:** Banco vazio é montado pelo repositório; CI reproduz build; contas por papel passam CRUD e isolamento; falhas reproduzidas viram regressões sem envio a pessoas reais.

**Arquivos/migrações:** `.github/workflows/responsive-layout.yml`, `package.json`, `supabase/baselines/20261004_public.sql`, `lib/testing/audited-database.ts`, `tests/fixtures/audited-schema.json`, `scripts/audit/`.

**Verificação:** Reprodução anterior com código auditado; Banco vazio PGlite + oito migrações; Supabase Auth/REST real; Regressão Chromium e CI. Evidências: [before-reproductions.log](evidence/before-reproductions.log), [tests.log](evidence/tests.log), [build.log](evidence/build.log), [responsive.log](evidence/responsive.log), [homologation-ledger.json](evidence/homologation-ledger.json).

## Verificações e limites

Os comandos e saídas desta execução estão em `evidence/`. Linhas de log têm somente espaços finais/CR de progresso normalizados, sem mudança dos resultados. O teste anterior foi repetido contra o código auditado em ambiente simulado, reproduzindo: falso sucesso B2B, intervalo escolar invertido, perda de participantes, perda de paradas e acesso legado indevido. As regressões novas exercitam as correções no schema completo recriado, sem usuários reais.

- `npm test`: 225 testes Vitest em 31 arquivos + 20 testes Node, todos aprovados, sem ignorados. Auth é simulado nos testes de domínio/servidor; PostgreSQL PGlite usa o schema público auditado completo e oito migrações, mas não prova rede, SMTP ou Auth real.
- `tsc --noEmit`: aprovado. `eslint .`: zero erros e 19 avisos preexistentes de Hooks, sem esconder regras. `npm run build`: aprovado com Next 16.4.1, sem scripts que modifiquem fontes.
- `pnpm audit --prod --json`: zero avisos, 157 dependências de produção no resultado. A triagem se refere ao lockfile desta execução; não promete ausência futura de vulnerabilidades.
- `RESPONSIVE_TOOLS=$PWD RESPONSIVE_ENGINES=chromium node tests/responsive/run.mjs`: 1205 verificações, zero falhas, com backend simulado, cinco papéis e oito larguras. Não foram reutilizados números da auditoria: são novas execuções, com logs próprios.
- Auth/REST reais de homologação: sete identidades fictícias sem dados oficiais; testes de metadata, isolamento, rollback, agenda, concorrência, metas, senha, contatos/principal, convênio, interação e paginação. Contas foram criadas por seed isolado aprovado no banco, não por envio a destinatário.
- Concorrência do último gerente foi testada em duas transações PostgreSQL reais; concorrência de ações escolares em duas requisições Auth/REST simultâneas. As filas e IDs foram consultados depois da gravação.
- Navegador usa aplicação Next.js local compilada conectada ao Supabase real isolado. Chamadas externas de Chromium são encaminhadas pela saída HTTP do executor, sem fabricar respostas. Os IDs de cenários e tempos efetivamente concluídos estão em `browser-homologation-results.json`; somente esses são declarados retestados.
- Não houve teste autenticado ou mutação na versão publicada, teste de carga/destrutivo em produção, envio de WhatsApp, convite a pessoa real, OAuth Microsoft, recuperação recebida por e-mail ou teste em aparelho físico.

As tabelas privadas de guarda/reserva mantêm RLS sem política de usuário, intencionalmente negando acesso. Advisor de homologação também indicou proteção de senha vazada desligada: depende de configuração do responsável no Auth. Avisos de índices sem uso numa branch nova e FKs sem índice são oportunidades de medição, não evidência de lentidão nem autorização para remover índices.

## Observações adicionais reproduzidas

A exclusão física de empresa com histórico é recusada pela FK `company_portfolio_history_company_id_fkey` já existente. O teste real confirmou que empresa e contatos permanecem preservados. Não foi removida essa proteção para apresentar CRUD completo: definir arquivamento ou descarte autorizado é uma decisão comercial pendente. Essa observação está registrada na F13 e não foi convertida em um 18º achado supostamente pertencente ao relatório original.

Durante a regressão foi detectado e corrigido aviso de erro que interceptava clique no rodapé do modal. O critério de aceite final inclui clicar Cancelar sem forçar o navegador, preservando os valores antes do cancelamento.

## Validação adicional de 28/10/2026

Quatro cenários adicionais foram concluídos: bloqueio de três rotas sem sessão; CRUD/persistência e permissões de exclusão do demo; cadastro/edição/filtro e recarga de escola; e contato/agendamento escolar por edição com localização na Agenda High School após recarga. Os três últimos registros estão em [browser-remaining-results.json](evidence/browser-remaining-results.json); o bloqueio sem sessão está em [browser-access-results.json](evidence/browser-access-results.json). Não foram repetidos os 12 cenários anteriores de metas/perfis.

O formulário de escola apagava seus campos quando o servidor recusava CNPJ inválido: React concluía a ação do formulário e reinicializava os inputs mesmo com `ok: false`. O envio agora captura FormData em `onSubmit`, dentro da transição existente, conservando os campos até a gravação confirmada. A falha anterior está em [before-remaining-browser.json](evidence/before-remaining-browser.json), junto aos erros iniciais de seletores do roteiro, explicitamente distintos do bug. O teste final comprovou nome preenchido após erro, correção do CNPJ e criação/edição persistida. A mesma preservação após recusa foi acrescentada à suíte responsiva de CI, usando uma resposta de erro controlada, em Chromium e WebKit. Essa observação adicional pertence à regressão F20/F45 e não foi inventada como um 18º achado original.

O build local encontrou cache Turbopack inválido após a interrupção. A pasta `.next` anterior foi preservada fora do checkout e o build limpo passou, assim como tipos e lint dos arquivos alterados. Nenhuma migração ou dado oficial foi alterado. [Resultado dos comandos e configuração disponível](evidence/remaining-readiness.json).

O CI #26 concluiu 245 testes e 2410 verificações Chromium/WebKit com backend simulado, sem falhas, no commit `cce9393`. A descrição do PR vincula o CI do novo commit desta correção; a evidência anterior não é apresentada como execução de outro SHA.

## Entrega operacional

- [Pendências verificadas e insumos necessários](remaining-execution.md).
- [Matriz completa das 47 funcionalidades](matrix-updated.md), com camada e limites; [JSON](matrix-updated.json).
- [Plano de implantação, ordem das oito migrações e recuperação](deployment.md).
- [Prévia da escala, responsáveis identificados e capacidade](scale-preview.md).
- [Rastreabilidade dos 17 achados](execution.json), incluindo arquivos, critérios e evidências.

## Dependências e decisões restantes

1. Disponibilizar a chave administrativa **somente da homologação** como variável segura no servidor para validar os fluxos legítimos de usuários e as telas dependentes de Admin SDK. Não enviar senha/token no chat.
2. Disponibilizar uma caixa de teste e configurar SMTP/templates/redirect URLs para testar recuperação completa e entrega/atualização/cancelamento de convites.
3. Definir modo Microsoft aprovado e configurar tenant, OAuth, permissões, conta organizadora e as variáveis indicadas em `docs/b2b-outlook-teams.md`.
4. Confirmar as preferências/restrições dos seis consultores, vínculo do sétimo, participação operacional, rodízio, horário do GDC e pausa ou cobertura externa. A prévia não é uma distribuição pessoal final.
5. Confirmar origem e atribuição das inscrições B2B SuperVest, política de agenda unificada/conflitos entre módulos e de arquivamento/exclusão de empresas com histórico.
6. Revisar PR/CI, aplicar as oito migrações e publicar somente após aprovação. Em seguida executar os checks descritos em `deployment.md`.
