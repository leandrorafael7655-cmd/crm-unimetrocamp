# Migrações e recuperação para revisão do PR #27

Decisão do responsável em 28/10/2026: a validação final será em produção, fora do horário de uso, com backup completo, usuário de teste e revisão final antes de publicar. Este documento substitui a exigência anterior de uma nova homologação. Nenhuma das migrações novas foi aplicada ao projeto oficial nesta etapa.

## O que cada migração faz

Aplicar somente estes **12 arquivos**, nesta ordem. Não executar o baseline, fixtures de falha nem um `db push` indiscriminado contra o histórico remoto. As oito primeiras migrações já existiam no PR; quatro foram acrescentadas pelas decisões finais.

| Nº | Arquivo | Explicação para a operação comercial | Dados afetados |
|---|---|---|---|
| 1 | `20261027204357_audit_access_security.sql` | Impede que um cadastro escolha ser gerente e protege o último gerente ativo. Mudanças de acesso passam pela administração autorizada. | Acrescenta controles internos; não promove nem desativa contas existentes. |
| 2 | `20261027204641_audit_atomic_writes.sql` | Salva a ação escolar junto com participantes/resultados e a rota junto com suas paradas. Se algo falhar, a edição inteira é desfeita. | Instala funções; mantém os IDs e o histórico. |
| 3 | `20261027204658_audit_business_validation.sql` | Impede CNPJ duplicado com outra pontuação, horários inválidos e conflitos escolares de principal/apoio. | Cria índices e reservas auxiliares; não funde nem apaga cadastros. Duplicidades/conflitos anteriores interrompem a aplicação. |
| 4 | `20261027204755_audit_b2b_writes.sql` | Salva empresa, contatos e convênio juntos; também salva a interação junto com o próximo passo. | Instala funções de gravação; não converte resultados existentes. |
| 5 | `20261027204806_audit_attendance_rules.sql` | Configura SM 9h–20h com cobertura mínima 3 e sábado 9h–13h com cobertura 2. Mantém GDC e preferências pendentes para a futura escala. | Atualiza parâmetros de atendimento; não cria escala, atribui pessoas nem publica rascunhos. |
| 6 | `20261027205646_audit_explicit_runtime_grants.sql` | Explicita quais operações o aplicativo pode pedir ao banco, conservando as restrições de cada usuário. | Ajusta permissões técnicas; não transforma consultor em gerente. |
| 7 | `20261027210239_audit_schedule_identity_guards.sql` | Impede trocar dono/ID da empresa por um atalho e exige responsável e horários em uma ação escolar agendada. | Protege novas gravações; mantém dados históricos para revisão. |
| 8 | `20261027212751_audit_optional_route_return.sql` | Mantém o retorno da rota opcional e valida a ordem das paradas e o horário do GDC. | Não preenche horários por suposição. |
| 9 | `20261028183657_audit_final_calendar.sql` | Organiza tentativas de envio por um único processador. A reunião convida apenas seu responsável do CRM; remarcação e cancelamento preservam a identidade do evento. | Acrescenta controle de processamento à fila. Mensagens antigas para contatos externos ficam preservadas e não são enviadas pelo novo processador. |
| 10 | `20261028183704_audit_manual_b2b_goals.sql` | Cria os lançamentos manuais de metas/inscrições por consultor, empresa e ciclo, com histórico de autor, data e valores. Somente gerente lança; consultor consulta seus próprios dados. | Cria duas tabelas vazias. Não importa inscrições e não inventa resultados zero. |
| 11 | `20261028183711_audit_reversible_archiving.sql` | Troca exclusão física de empresa/escola por arquivamento e permite reativar mantendo tudo. Convênio ativo não arquiva empresa. | Cria campos e histórico; nenhum cadastro existente é arquivado automaticamente. |
| 12 | `20261028183718_audit_unified_external_agenda.sql` | Bloqueia conflitos externos entre módulos, permite tarefas internas sobrepostas, gera convite de follow-up com data e sincroniza compromisso avulso com a fila na mesma transação. | Cria reservas auxiliares. Próximos passos antigos começam como internos; não são classificados como externos por suposição. Não publica escala. |

## Backup completo antes de começar

1. Fechar a janela de gravações do CRM e suspender crons/processadores de convites. Registrar a versão Vercel ativa, SHA, histórico de migrações, definições de funções/políticas/grants, parâmetros de atendimento e horário de início. Não basta ocultar botões: impedir uso dos caminhos antigos durante a manutenção.
2. Criar o ponto **B00**, recuperável pelo procedimento de backup/restore do Supabase oficial. Deve incluir schema e dados de negócio, Auth/usuários, esquemas privados, políticas, funções, triggers, sequências e histórico de migrações. Guardar o identificador/arquivo e checksum em local privado; nunca no PR. A exportação da escala feita anteriormente é **parcial**, não substitui B00.
3. Conferir os arquivos do Storage: backup de banco conserva metadados, não os anexos propriamente ditos. Se houver objetos, copiá-los com manifesto de nomes, tamanhos e hashes. Registrar separadamente configurações Auth/SMTP, funções Edge e versão Vercel, sem imprimir credenciais.
4. Verificar o mecanismo de restauração disponível no plano do projeto. Se não existir backup gerenciado restaurável, preparar exportação pelo CLI oficial de roles, schema e dados, incluindo Auth/Storage, e comprovar a recuperação antes de migrar. Credenciais entram somente por configuração segura local/painel; não pelo chat. **Sem backup completo recuperável, a publicação não começa.**
5. Executar `supabase/preflight/audit_20261027.sql` e `supabase/preflight/final_decisions_20261028.sql` imediatamente antes da aplicação. Resolver conflitos com seus responsáveis; nunca excluir dados para fazer a migração passar.

Referências operacionais: [backup e recuperação do Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) e [backups do banco](https://supabase.com/docs/guides/platform/backups). O procedimento de recuperação integral depende do recurso efetivamente disponível no projeto e ainda não foi executado nesta entrega.

## Como desfazer cada etapa

**Se a aplicação de um arquivo falhar**, sua transação reverte aquele arquivo. Não continuar para o seguinte. Conferir o histórico de migrações antes de repetir.

**Se a etapa terminou e um teste na manutenção falhar**, manter o CRM fechado. O plano de retorno exato é restaurar B00 e reaplicar apenas as etapas anteriores ao ponto desejado, conforme a tabela. Isso evita scripts de `DROP` que eliminariam histórico ou lançamentos novos. Usar o procedimento de restore aprovado para o projeto e conferir contagens, IDs, Auth e configurações antes de reabrir. Não executar o baseline auditado sobre o banco existente.

| Etapa a retirar | Recuperação durante a manutenção | Atenção específica |
|---|---|---|
| 1 — segurança | B00, sem reaplicar migrações do PR. | Manter cadastro público e escrita sensível bloqueados; não reabrir o caminho que aceita privilégios de metadados. Preferir corrigir para frente conservando essa proteção. |
| 2 — gravações atômicas | B00 + 1. | Conservar os participantes, resultados e paradas do backup; não voltar a exclusão/reinserção em uma operação aberta aos usuários. |
| 3 — validações | B00 + 1–2. | Não remover índices/validações para aceitar duplicidades. Registrar os registros que impediram a implantação. |
| 4 — persistência B2B | B00 + 1–3. | Conferir empresas, contatos, convênios e próximos passos pelas mesmas chaves. |
| 5 — parâmetros da escala | B00 + 1–4. | Recupera os parâmetros anteriores; não recupera os lançamentos de escala apagados por solicitação do responsável em 28/10. Esse apagamento precede B00. |
| 6 — permissões técnicas | B00 + 1–5. | Recupera os grants reais anteriores. Nunca usar `grant all` ou desligar RLS como atalho. |
| 7 — identidade/agendamento | B00 + 1–6. | Conservar os IDs e donos anteriores; suspender alterações de carteira pelo caminho antigo. |
| 8 — retorno opcional | B00 + 1–7. | A regra anterior é mais rígida para rotas sem retorno. Não inventar retornos para permitir a edição. |
| 9 — convites/fila | B00 + 1–8. | Desligar os processadores antes do restore. E-mails já enviados não são desfeitos pelo banco: cancelar os eventos de teste pelo mesmo UID, quando possível, e registrar a reconciliação. Não ligar o processador Edge antigo em paralelo. |
| 10 — lançamentos B2B | B00 + 1–9. | Exportar lançamentos e histórico feitos após B00 antes de qualquer restore. Não perder resultados comerciais reais. |
| 11 — arquivamento | B00 + 1–10. | Não habilitar exclusão física. Um arquivamento individual pode ser desfeito pela própria opção Reativar, sem restaurar o banco. Preservar o histórico de arquivamentos posterior ao backup. |
| 12 — agenda unificada | B00 + 1–11. | Suspender agendamentos durante o retorno, preservar compromissos e reconciliar convites já enviados; a reserva auxiliar pode ser reconstruída a partir das fontes. |

**Depois que o uso real for reaberto**, B00 não pode ser restaurado indiscriminadamente: isso perderia gravações posteriores. Nesse caso, suspender o fluxo afetado, exportar as alterações e fazer uma migração corretiva ou um retorno com conciliação aprovado pelo responsável. Os planos acima são para a janela sem gravações reais concorrentes.

## Publicação e teste de aceite, ainda pendentes

- Manter PR em rascunho e sem deploy automático até aprovação do responsável.
- Aplicar os arquivos revisados em ordem e registrar o resultado de cada um. As novas tabelas/projeções não autorizam envio de e-mail por si só.
- Publicar o processador Edge aposentado de `supabase/functions/send-calendar-invites/index.ts` (resposta 410) antes de habilitar o novo envio, eliminando o consumidor antigo. Publicar o código Vercel aprovado com as variáveis do responsável; não configurar Microsoft.
- Usar um usuário de teste para os fluxos de dados. Para os dois convites expressamente solicitados, confirmar o ID/e-mail do perfil Rafael pelo cadastro, criar somente um compromisso fictício e uma reunião fictícia com empresa, sem destinatários externos. Registrar os IDs/UIDs, confirmar recebimento e calendário e depois verificar remarcação e cancelamento. Não confundir `sent_provider` com recebimento ou inclusão na agenda.
- Conferir acessos de gerente, supervisor, B2B e High School, dados próprios, recarga, persistência, arquivamento/reativação, conflitos externos, tarefas internas e lançamentos B2B. Não injetar falhas destrutivas nem rodar carga em produção.
- Preferências e GDC ficam para a nova escala. A ausência dessas definições não bloqueia este PR nem os compromissos avulsos; permanece impedida a publicação de uma escala coletiva sem revisão.
