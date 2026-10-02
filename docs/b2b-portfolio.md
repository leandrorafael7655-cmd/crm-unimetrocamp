# Gestão de carteiras B2B — UniConecta

## Telas e comportamento

- `/b2b/carteira`: painel, Minha carteira / Todas as carteiras, Empresas disponíveis, Solicitações de Carteira, Kanban, histórico e notificações internas.
- `/?company=<id>`: ficha existente da empresa, com responsável, convênio, relacionamento, ciclo, última ação, próxima ação, transferência e solicitação.
- `/dashboard` e painel B2B existente: indicadores de relacionamento e ação no ciclo; indicadores do consultor restritos à própria carteira.
- A agenda, reuniões Outlook/Teams/e-mail, contatos, mapas, rotas e ações presenciais/online continuam utilizando os registros anteriores.

O diretório **De quem é?** e o acesso de leitura do High School foram preservados. Consultores não recebem poderes de edição sobre empresas de outras carteiras. A nova gestão de carteira mostra ao consultor suas empresas e as oportunidades disponíveis.

## Estrutura reaproveitada

`companies.owner_id` é o único responsável principal. O campo legado `consultor` acompanha o nome operacional desse usuário. Participantes e responsáveis de ações não transferem a empresa.

`agreements` permanece a fonte do convênio. `activities` permanece a fonte de contatos, visitas e reuniões; `company_actions` continua armazenando ações presenciais e divulgação online. Atribuição e aprovação nunca inserem atividades nessas tabelas.

## Migração

`supabase/migrations/20261002180014_b2b_portfolio_relationship.sql`

- `companies`: `relationship_status`, `relationship_changed_at`.
- `app_settings`: `b2b_risk_days` (30), `b2b_critical_days` (15).
- `company_portfolio_history`: auditoria permanente de atribuições, relacionamento e solicitações; valores anterior/novo, motivo, observação, autor e horário.
- `company_assignment_requests`: solicitação, autor, responsável anterior, versão do relacionamento, revisão e estados pending/approved/rejected/cancelled. Índice único impede solicitações pendentes simultâneas para a mesma empresa.
- `company_portfolio_notifications`: notificações por destinatário; deduplicação por empresa, ciclo e nível, ou por evento histórico.
- Views com `security_invoker`: `b2b_company_portfolio`, `b2b_activities_with_cycle`, `b2b_actions_with_cycle`.

Não são armazenados `current_cycle` nem `last_valid_activity_at`: são derivados das ações originais. Convênios, contatos, ações, participantes e responsáveis antigos são preservados. Vínculos legados sem usuário associado são conservados na auditoria, sem atribuição arbitrária a outro usuário.

## Permissões

- Gerente Comercial (`profiles.role = gerente`): transferência individual, em lote, carteira completa, redistribuição entre destinos, aprovação/recusa e configuração de alertas.
- Consultor B2B: própria carteira, registro de ações de sua responsabilidade, empresas disponíveis, solicitação e cancelamento de sua própria solicitação pendente.
- Supervisor: mantém leitura gerencial e as permissões operacionais anteriores; não transfere carteiras nem aprova solicitações.
- High School: leitura B2B preservada; não solicita nem transfere empresas.

Os comandos verificam o perfil ativo no banco, não `user_metadata`. Políticas RLS, privilégios de colunas e triggers protegem campos de relacionamento, identidade da atividade, alteração de responsável e autopromoção de perfil. Funções públicas novas usam security invoker; operações privilegiadas ficam no schema privado e verificam o ator.

## Ciclos automáticos

A única função de cálculo é `b2b_commercial_cycle(date)`. Ela retorna código, nome, início, fim, ano de referência, número e ordinal.

| Data | Código | Período |
|---|---|---|
| 15/01/2027 ou 30/04/2027 | 27.1 | 01/10/2026–30/04/2027 |
| 01/05/2027, 15/07/2027 ou 30/09/2027 | 27.2 | 01/05/2027–30/09/2027 |
| 01/10/2027 | 28.1 | 01/10/2027–30/04/2028 |

A regra é válida para anos futuros. A tabela preexistente `commercial_cycles`, referenciada pelas metas, é abastecida automaticamente em uma janela móvel. Seus IDs existentes são preservados; o relacionamento não depende de cadastrar ciclos. Novos períodos manuais incompatíveis são recusados.

## Ações e perda de relacionamento

Contam ações concluídas (`status = realizada`) de visita, reunião presencial/online/de relacionamento, apresentação de proposta, feira/evento, palestra, plantão, divulgação, ativação e renovação. As ações concluídas de `company_actions` contam como ação presencial ou divulgação online. Datas futuras não ativam relacionamento.

Não contam ligação, WhatsApp, e-mail, follow-up, ação interna/nota, edição cadastral, visualização da ficha, alteração de responsável nem reunião apenas agendada/cancelada.

Após uma ação no ciclo X, o relacionamento pode continuar durante o ciclo seguinte. Quando esse ciclo seguinte termina inteiro sem ação válida, o início do próximo ciclo marca a perda. Exemplo: última ação em 27.1 → permanece ativo em 27.2 → sem novas ações, perde em 28.1. A diferença de ordinais deve chegar a 2.

A perda muda somente o relacionamento: convênio e responsável são preservados. A revisão é idempotente; somente transições geram nova auditoria. A view já calcula a condição efetiva se uma execução da rotina atrasar.

Sem ação no ciclo corrente gera atenção. Nos últimos 30 dias gera risco; nos últimos 15, atenção crítica. O gerente pode configurar esses limites. Saúde é um indicador separado do status oficial. Existência de próxima ação participa da priorização operacional.

## Solicitações e transferências

1. Empresa inativa ou sem responsável fica disponível para solicitação.
2. Solicitação conserva responsável e versão do relacionamento no momento do pedido.
3. Gerente aprova ou recusa com observação opcional. Cancelamento próprio também permanece na auditoria.
4. Aprovação atribui o solicitante, atualiza a carteira e registra revisão e transferência na mesma transação. Não gera atividade comercial; mantém relacionamento inativo.
5. Uma ação válida do responsável atual reativa o relacionamento e registra tipo, ação, consultor e ciclo na auditoria.

Uma solicitação antiga não sobrescreve uma transferência ou reativação posterior: a aprovação verifica a versão e o responsável anterior. A transferência em lote trava empresas em ordem estável e verifica os responsáveis esperados. Uma falha desfaz o lote inteiro.

O fluxo de desligamento permite seleção de empresas, divisão entre consultores e confirmação das quantidades por destino. Acesso não é excluído automaticamente. Redistribua toda a carteira e depois desative/exclua o acesso em Gestão de usuários. O banco bloqueia a saída ou mudança de perfil enquanto houver empresas vinculadas, e a exclusão conserva o perfil histórico e seu nome operacional.

## Rotina automática

`GET /api/cron/b2b-relationships`, diariamente às 07:00 UTC (04:00 de São Paulo), com Bearer `CRON_SECRET`. Usa a configuração administrativa já existente. Abertura/atualização da carteira também revisa o relacionamento. Ausência do segredo retorna 503; autenticação incorreta retorna 401. A rotina não envia convites ou e-mails.

## Validação

Execute `npm test` e `npm run build`. O build aplica os scripts de compatibilidade já existentes no projeto.

`lib/b2b-portfolio/migration.test.ts` executa a migração em PostgreSQL PGlite, com papéis e RLS: ciclos em cinco anos, viradas, metas automáticas, transferência individual e de 30 empresas, transação integral, manutenção de contatos/convênio/histórico, expiração idempotente, solicitação ativa/duplicada, aprovação obsoleta, aprovação sem ação fictícia, reativação, ação online, participante sem mudança de dono, cancelamento/recusa, divisão entre destinos, permissões e saída do consultor.

Para validar pela interface, use empresas e observações claramente identificadas como teste. Não use e-mails de contatos reais em reuniões de teste. Abra a ficha, confira os status separados, faça uma solicitação em empresa disponível, revise como gerente, registre uma ação realizada e confira a reativação. Transfira pelo modal e confira a auditoria após atualizar a página.

## Arquivos principais

- Banco: migração acima.
- Servidor: `app/actions/b2b-portfolio.ts`, `app/api/cron/b2b-relationships/route.ts`.
- Domínio e testes: `lib/b2b-portfolio/domain.ts`, `lib/b2b-portfolio/migration.test.ts`.
- Interface: `app/b2b/layout.tsx`, `app/b2b/carteira/page.tsx`, `components/b2b/portfolio-board.tsx`, `portfolio-dialogs.tsx`, `company-portfolio-summary.tsx`, `company-relationship.tsx`.
- Integrações: cadastro/ficha B2B, navegação, indicadores, mapeamento/persistência, ações, metas/ciclos e administração de usuários.

Não há nova dependência de Outlook, Microsoft, SMTP ou integração externa para a gestão de carteiras.
