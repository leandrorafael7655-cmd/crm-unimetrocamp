# Convites a contatos de empresas e escolas

## Escopo deste PR

O consultor cria o link no Teams e cola no CRM. O SMTP atual envia ao próprio consultor e aos contatos que ele seleciona na ficha. Não há integração Microsoft, criação automática de links, OAuth novo ou importação de RSVP.

Telas alteradas:

- Ficha da empresa: painel **Reuniões e convites**, contato opcional, seleção por caixas, modalidade e link do Teams, remarcação/cancelamento e histórico por destinatário, revisão, horário e tentativas; confirmação de cancelamento com os destinatários originais. Contatos sem e-mail não podem ser selecionados. Os agendamentos anteriores continuam no histórico com seu fluxo original, sem adicionar destinatários retroativamente.
- Ficha da escola: o mesmo painel, sem exigir edição do SuperVestibular, séries ou resultados de captação. A reunião cria uma única `school_actions`, com o mesmo ID do agendamento; as agendas continuam mostrando a mesma ação. O formulário de divulgação encaminha novos agendamentos de reunião para esse painel.
- Agenda B2B, Agenda High School e Minha agenda: entrega SMTP exibida como **Enviado · aguardando resposta**, sem inferir aceite a partir de `meeting_rsvp`. Falha parcial ou envio ainda pendente não aparecem como sucesso completo.
- B2B: filtro **Arquivadas** tolera uma empresa cujo `portfolio` não contém `current_cycle`. Listagem e reativação têm cobertura automatizada, junto com a preservação do histórico no RPC de arquivamento.

## SQL completo e impacto para aprovação

O arquivo integral a revisar é [`20261029235301_contact_meeting_invitations.sql`](../supabase/migrations/20261029235301_contact_meeting_invitations.sql). **Não aplicado em produção.** Executar apenas após aprovação explícita deste arquivo e do seu SHA/checksum final.

| Alteração | Impacto |
|---|---|
| `contact_meetings` | Novos agendamentos e sua identidade estável; empresa **ou** escola; consultor obrigatório; remetente preservado após o primeiro claim. `delivery_enabled=false` por padrão. |
| `contact_meeting_recipients` | Cópia dos nomes, endereços e IDs selecionados na criação. Não consulta endereços novos da ficha ao remarcar/cancelar. Cada pessoa fica no histórico mesmo quando várias usam o mesmo e-mail. |
| `contact_meeting_jobs` | Um envio por endereço normalizado, operação e sequência. Fila nova; sem consumir ou reescrever `calendar_invite_jobs`. |
| `activities.contact_meeting_id` e `school_actions.contact_meeting_id` | Colunas nullable e vínculos únicos para a origem. Nenhum backfill. `ALTER TABLE` precisa de lock de DDL breve; prever a janela antes de aplicar. |
| `private.guard_contact_meeting_source` | Impede que editores legados alterem a origem de uma nova reunião por fora do novo fluxo; registros legados continuam funcionando. |
| `private.sync_school_action_agenda_trigger` | Única função existente substituída: encaminha ações antigas ao sincronizador original e deixa as novas reuniões para sua fila própria. Evita dois convites/agendas para a mesma ação. |
| `save_contact_meeting` | RPC somente `service_role`: valida papel, carteira, ficha, IDs dos contatos e revisão; grava origem, destinatários e jobs na mesma transação. |
| `claim_contact_meeting_job` | RPC somente `service_role`: respeita pausa individual, consultor ativo, endereço de teste, remetente original, lease e revisão atual. |
| RLS e GRANTs | SELECT explícito para authenticated, restrito a responsável/gestão ativos e sem troca de senha pendente; nenhum acesso anon/PUBLIC; escrita/RPC apenas pelo backend. Não depende de exposição automática. |

A migração não executa `DROP`, `DELETE`, `UPDATE` ou `TRUNCATE` sobre registros existentes. As definições das novas funções contêm `UPDATE` para futuras operações sobre **a reunião solicitada** e seus jobs. Não há exportação, backfill, limpeza da fila antiga, alteração em Auth/Storage ou disparo de e-mail pelo SQL.

`claim_calendar_email_jobs`, os resguardos privados de 29/10, o pre-request de pausa/troca de senha, os três convites antigos terminais e os jobs de teste anteriores ficam fora deste PR. A aplicação deve manter `UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS=true`, `CALENDAR_TEST_USER_ID` e a rota 503 do cron até a aprovação do teste seletivo.

## Garantias e limites de entrega

- Cada mensagem inclui só seu destinatário nos ATTENDEE; nenhum contato de outra ficha ou endereço livre pode ser adicionado. A validação ocorre na action e novamente no banco.
- O assunto é armazenado sem o prefixo e o nome da ficha. O título enviado é montado uma vez: `UniConecta | [assunto] | [empresa/escola]`.
- Link HTTPS validado tanto para Online (obrigatório) quanto para Presencial (opcional). Ele aparece no HTML clicável, no texto/descrição, LOCATION e URL do `.ics`; em Presencial, LOCATION preserva o endereço físico e URL guarda o link opcional. Nenhum servidor busca o link.
- UID e remetente estáveis; SEQUENCE 0 no primeiro convite, depois 1, 2… Atualização/cancelamento preservam destinatários e endereços. Para trocar a lista, cancele e crie outra reunião.
- Fila persistida mesmo com envio pausado. O worker verifica a variável antes de reservar jobs ou abrir SMTP. Com `CALENDAR_TEST_USER_ID`, exige o perfil correto **e todos os endereços iguais ao e-mail desse perfil**.
- Novos agendamentos começam com envio individual bloqueado. Alterar só a variável global não libera essa fila. O teste real terá aprovação dos IDs exatos primeiro.
- Ao alterar a reunião, REQUESTs antigos ainda não enviados ficam `superseded` **somente na fila nova**. Requisições antigas nunca voltam a sair após o cancelamento. Histórico enviado permanece.
- Lease exclusivo por reunião bloqueia edição durante o envio. Lease vencido vai para `delivery_unknown` e exige conferência; não é reencaminhado automaticamente. Destinatários já enviados não são reenviados quando outro falha. SMTP não oferece transação atômica entre provedor e banco: se houver aceite SMTP sem registro confirmado, parar e conferir o histórico; Message-ID estável ajuda a identificar duplicidade, mas não prova entrega exatamente uma vez.

## Validação automatizada

- PostgreSQL PGlite com o esquema auditado completo e as 12 migrações anteriores: privilégios/RLS, isolamento entre fichas, contato vazio, deduplicação, endereços preservados, UID/sequência, falhas atômicas, lease, exclusão de REQUEST obsoleto, seleção de teste e lista/reativação arquivada. A definição de `claim_calendar_email_jobs` é comparada antes/depois da migração.
- SMTP simulado: nenhum envio/claim sob pausa ou perfil inválido, seleção de endereço na aceitação, envio por contato, redaction de erros, sequência e parada se o resultado não puder ser registrado. Sem credenciais ou mensagens reais.
- Formato Outlook: HTML com âncora escapada e `.ics` com URL, LOCATION, DESCRIPTION, UID e sequência nos REQUEST/CANCEL.
- Playwright: empresa e escola, seleção/contato desabilitado, salvar, remarcar, cancelar, histórico e link; filtro Arquivadas com `current_cycle` ausente, abrir e reativar. Chromium/WebKit, larguras 320–1920; junto com a suíte de responsividade existente.
- CI: testes, geração de tipos, TypeScript, lint, build e responsividade. PR deve permanecer rascunho. Nenhum merge automático.

## Aceitação real — pendente de aprovação, depois da migração e publicação

1. Revisar este SQL integral e seu impacto; obter aprovação para aplicar. Se a integração expirar, Rafael executa o mesmo arquivo no SQL Editor. Conferir histórico, GRANTs, RLS e contagens em READ ONLY.
2. Aprovação separada para merge do SHA final na main. Acompanhar Ready/commit/runtime. Preservar todas as pausas e bloqueios de cron; não liberar a equipe.
3. Criar pelo CRM uma **empresa fictícia e uma escola fictícia novas**, identificadas `TESTE CONVITES CONTATOS`, com contatos usando **apenas `rafael.leandro@unimetrocamp.edu.br`**. O consultor é o perfil de Rafael. Incluir um contato sem e-mail para comprovar a desabilitação, e duas pessoas com o mesmo e-mail para comprovar um envio por endereço.
4. Criar os dois agendamentos Online com assunto de teste, horários futuros sem conflito e link válido copiado do Teams. Mostrar IDs reais, destinatários copiados e jobs pendentes. Nenhum envio ainda.
5. Preparar SQL seletivo com assertions para esses **dois IDs**, origem, assunto, responsável, e-mails e `processing=0`; habilitar somente essas reuniões em `contact_meetings.delivery_enabled`. Mostrar o SQL exato e obter aprovação junto com a mudança temporária da variável para false. `CALENDAR_TEST_USER_ID` permanece; a fila antiga e a regra 503 permanecem pausadas.
6. Rafael faz Redeploy; conferir Ready e variável aplicada. Acionar **Tentar envio pendente** apenas nessas reuniões. Conferir uma mensagem por endereço, título, Teams clicável no Outlook, UID e sequência. Rafael confirma recebimento/agenda.
7. Em cada ficha, remarcar pelo CRM: mesmos destinatários e UID, sequência incrementada, mesmo evento atualizado no Outlook. Depois cancelar pelo CRM: CANCEL com o mesmo UID e nova sequência, remoção/estado cancelado no Outlook. Conferir jobs e aceite SMTP; registrar a confirmação pessoal de Rafael.
8. Desabilitar os dois IDs pelo SQL previamente exibido/aprovado, comprovar `processing=0`; voltar variável para true e aguardar o Redeploy Ready. Só então arquivar empresa/escola fictícias pelo CRM, preservando seus contatos, reuniões e histórico. Registrar resultado real, sem substituí-lo pelos testes automatizados.

## Liberação para a equipe — decisão futura e separada

Não executar neste PR ou no teste acima:

1. Revisar **todos** os pendentes acumulados, nas duas filas, antes de habilitar qualquer envio geral.
2. Mostrar SQL com IDs reais e assertions para tornar terminais os antigos testes “Sala de matrícula” (`c00e4668…` REQUEST, `ea16cf49…` CANCEL, evento `7630da1e…`) e qualquer CANCEL da B2B `4f98be6c…`, além dos novos jobs de teste remanescentes. Na fila legada, usar o terminal reconhecido `status='sent_provider', provider='superseded'`, com motivo, sem DELETE. Na fila nova, `status='superseded'`, com motivo. Preservar os três antigos já terminais.
3. Restaurar a função original de claim salva em `private.uniconecta_claim_original_20261029`, comparando definição/hash/owner/ACL com o resguardo. Este PR não altera essa função, então não há nova assinatura a sobrescrever na restauração. Remover a lista seletiva antiga e o trigger de título; restaurar o trigger de pausa à sua forma definitiva, preservando a checagem de troca de senha. Exibir o SQL e pedir aprovação.
4. Revisar a liberação **própria da fila nova**: IDs reais aprovados + eventual `ALTER COLUMN delivery_enabled SET DEFAULT true` para agendamentos futuros. Mostrar impacto e SQL; não inferir liberação a partir da restauração da fila antiga.
5. Apenas com autorização explícita, ajustar as pausas globais/cron, redeploy e liberar os destinatários aprovados, acompanhando falhas/duplicidade. O compromisso avulso ainda precisa de aceitação real; nunca fazer um primeiro disparo da fila inteira.
