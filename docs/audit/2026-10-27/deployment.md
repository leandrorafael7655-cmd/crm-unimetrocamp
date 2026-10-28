# Implantação e recuperação

Esta entrega não autoriza merge, migração em produção nem publicação. As oito migrações abaixo foram aplicadas somente à branch Supabase `audit-fixes-20261027` (`ktmcksngmhxtdnxunntl`), sem copiar dados de produção. O projeto oficial é `snixwajvzaxldglcwnig`.

## Ordem para revisão e aplicação

1. Criar backup recuperável do banco e registrar o deployment atualmente ativo. Repetir o preflight abaixo em modo somente leitura. Manter a versão antiga disponível para comparação, sem reabrir operações vulneráveis durante uma reversão.
2. Desabilitar cadastro público no painel Auth se a gerência confirmar o modelo interno por convite. A correção do gatilho funciona mesmo com signup habilitado; esta configuração não foi alterada em produção. Conferir contas criadas anteriormente e histórico de privilégios com o administrador, sem promover, remover ou reclassificar contas automaticamente.
3. Aplicar as migrações novas, em ordem, em uma janela que impeça gravações pelos fluxos antigos entre as etapas. Não executar `supabase db push` sem conferir o plano: os arquivos antigos do repositório não reproduzem integralmente o histórico remoto.

| Ordem | Arquivo | Impacto |
|---|---|---|
| 1 | `20261027204357_audit_access_security.sql` | Signup inativo sem privilégios; RPC administrativa; trava do último gerente e de remoção/banimento no Auth. Nenhuma conta existente é promovida ou desativada pela migração. |
| 2 | `20261027204641_audit_atomic_writes.sql` | RPCs transacionais de ações escolares e rotas; preserva identificadores. |
| 3 | `20261027204658_audit_business_validation.sql` | CNPJ canônico, validação, projeção de reservas e exclusão de conflitos escolares. Não mescla empresas. Remove um índice duplicado, conservando a restrição equivalente. |
| 4 | `20261027204755_audit_b2b_writes.sql` | Empresa/contatos/convênio e interação/próximo passo atômicos, com RLS. |
| 5 | `20261027204806_audit_attendance_rules.sql` | Sábado até 13h, cobertura 3/2, GDC pendente, tipos GDC/evento e publicação transacional. Não muda participantes, rascunhos ou responsáveis. |
| 6 | `20261027205646_audit_explicit_runtime_grants.sql` | Grants explícitos necessários para ambiente novo; mantém RLS, tokens Microsoft inacessíveis ao navegador e auditoria sem escrita direta. |
| 7 | `20261027210239_audit_schedule_identity_guards.sql` | Protege identidade/carteira B2B e exige responsável/intervalo em agendamentos escolares. |
| 8 | `20261027212751_audit_optional_route_return.sql` | Preserva retorno opcional de rotas, valida ordem não negativa e horário de GDC. |

4. Publicar o código aprovado com o lockfile deste PR. `git.deploymentEnabled` bloqueia o deploy automático desta branch de correções; não altera a publicação de `main`. Configurar a prévia com o banco de homologação antes de habilitar qualquer deploy de revisão.
5. Conferir Auth, CRUD, rollback e isolamento por perfil após a publicação. Só então abrir as gravações. A entrega da escala deve continuar bloqueada até sua revisão operacional.

## Preflight obrigatório

Executar `supabase/preflight/audit_20261027.sql`. Índices únicos e a projeção de reservas falham e revertem a migração inteira se houver duplicidade/conflito: resolver por decisão comercial identificada, com backup, antes de tentar novamente. Nenhum script desta entrega apaga, funde ou atribui esses registros automaticamente.

Na leitura de produção desta execução: 1 gerente ativo; zero CNPJs canonicamente duplicados em empresas/escolas; zero intervalos escolares invertidos; zero conflitos escolares; zero ações agendadas incompletas. Quatro rotas têm somente saída, sem retorno: são compatíveis com o fluxo existente e permanecem permitidas pela migração 8. Repetir a consulta no momento da implantação; estes valores não são uma garantia futura.

Os CHECKs `NOT VALID` passam a proteger gravações novas e alterações, preservando o histórico durante a inspeção. Após revisar os registros antigos, validar cada constraint explicitamente. Um registro antigo inválido precisará ser corrigido de forma autorizada antes de sua edição. Não usar desativação de RLS/constraints para contornar falhas.

## Ambiente novo e configuração segura

O snapshot `supabase/baselines/20261004_public.sql` contém somente o schema público auditado, funções, políticas e grants. Serve exclusivamente para projeto Supabase **vazio e isolado**, com schema Auth gerenciado já disponível. Aplicar esse snapshot e as oito migrações em sequência, sem exposição ao público entre as etapas. Ele não deve ser aplicado a produção ou sobre o histórico remoto já existente. Não mesclar a branch de banco de testes: aplicar somente as oito migrações de correção revisadas, sem fixtures. O gerador é `node scripts/audit/export-baseline.mjs`; o teste `createAuditedDatabase` recria as 50 tabelas a partir desse mesmo schema, usando um Auth mínimo simulado no PGlite.

Usar URL/chave pública de homologação no cliente e chave administrativa **somente desse ambiente**, por variável segura no servidor. A chave administrativa não estava disponível ao executor; por isso fluxos legítimos do Admin SDK e telas dependentes dele continuam com validação integrada pendente. Nunca usar a chave oficial para esses testes. Bootstrap inicial exige `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_SETUP_TOKEN` com pelo menos 32 caracteres, fornecido por canal seguro; não é necessário para um CRM com gerente já existente.

Em homologação, `UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS=true` impede que o processamento normal da fila acione o provedor. O resultado informa `configured=false` e zero envios; não simula entrega. Os testes reais desta entrega criaram eventos/jobs com destinatários fictícios, sem chamar disparos manuais, recuperação por e-mail ou APIs de convite. Esse sinalizador cobre o dispatcher compartilhado, não é uma barreira geral para todas as APIs do provedor: manter SMTP/Graph de produção fora da homologação e usar uma caixa coletora antes dos testes de entrega. Não configurar o sinalizador em produção se o envio estiver aprovado.

## Recuperação

Cada migração usa transação. Falha de aplicação reverte aquela etapa; interromper a publicação e corrigir a causa antes de repetir, conferindo o ledger. Antes do deploy, não manter aplicações antigas gravando por caminhos não atômicos.

Após aplicação, preferir uma migração corretiva para frente. Não remover as proteções de acesso, último gerente ou atomicidade para reabrir uma versão antiga. Se houver falha funcional, suspender a gravação afetada, restaurar o deployment compatível com o schema protegido e comparar com o backup. Restaurar o banco inteiro apenas com plano de conciliação das gravações posteriores, aprovado pelo responsável. As migrações não substituem backup/PITR.

## Verificações após publicação (a executar pelo responsável)

- Conferir Next 16.4.1 efetivamente publicado, lockfile, logs e migrações aplicadas.
- Autenticar gerente, supervisor, B2B e High School de teste; testar URL direta, recarga, saída e nova entrada. FDV e SM não foram criados como papéis novos: confirmar o vínculo comercial antes de mudar permissões.
- Negar elevação por metadata/REST, rotas administrativas por consultor/supervisor e saída do último gerente.
- Criar/editar empresa, ação escolar com principal/apoio e rota; verificar persistência e IDs, erro controlado e rollback no ambiente isolado.
- Comparar a agenda escolar dos participantes antes/depois de edição e cancelamento. Conferir filtros e impedir duplicatas.
- Recuperação de e-mail: caixa de teste, redirect URLs/templates, solicitação, recebimento, uso único/expiração e senha efetiva.
- Convites: caixa de teste, atualização/cancelamento pelo mesmo UID e resposta do destinatário. Microsoft: tenant, permissões, variáveis, conta/organizador e OAuth reais.
- Conferir metas próprias e indicador indisponível quando a fonte não existir; reconciliar números com lançamento fictício conhecido.
- Revisar a prévia da escala e as preferências antes de qualquer publicação. Não publicar os 246 rascunhos em lote.

## Fixture de falha controlada

Os scripts `scripts/audit/homologation-fault-setup.sql` e `homologation-fault-cleanup.sql` são exclusivos da homologação com as contas fictícias. O primeiro injeta falha no prefixo de teste; o segundo desativa essa falha por substituição da função por operação neutra, sem excluir objetos ou dados. A falha foi desativada após os 12 cenários de navegador. Essa limpeza de fixture não é uma nona migração de produção.
