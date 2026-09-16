# Convites automáticos por e-mail

O CRM gera um convite iCalendar ao publicar a escala e ao salvar agendamentos de ações com responsável, data e horários completos. O destinatário aceita ou recusa no seu aplicativo de calendário. Não há acesso à agenda do destinatário nem aceite automático.

## Ativação por SMTP independente

Cadastre em **Supabase > Edge Functions > Secrets** as credenciais de um serviço SMTP com remetente autorizado:

| Secret | Valor |
| --- | --- |
| `CALENDAR_EMAIL_PROVIDER` | `smtp` |
| `CALENDAR_SMTP_HOST` | Servidor informado pelo serviço contratado |
| `CALENDAR_SMTP_PORT` | `587` (STARTTLS) ou `465` (TLS direto), conforme o serviço |
| `CALENDAR_SMTP_USER` | Usuário SMTP do serviço |
| `CALENDAR_SMTP_PASS` | Credencial SMTP do serviço |
| `CALENDAR_FROM_EMAIL` | Endereço remetente autorizado pelo serviço |

Opcional: `CALENDAR_ORGANIZER_EMAIL` (por padrão igual ao remetente), `CALENDAR_SMTP_SECURE` e `CALENDAR_CRM_URL`.

O TLS é obrigatório. Porta 465 ativa TLS direto automaticamente. Não use a senha comum do Outlook corporativo como substituição de credenciais de um serviço SMTP autorizado.

O SMTP de autenticação do Supabase (recuperação de senha) não é automaticamente disponibilizado à Edge Function. Se a instituição já tem um serviço SMTP próprio, ele pode ser reutilizado mediante suas regras de autorização e limites, configurando os secrets acima.

Não é necessário cadastrar um aplicativo Microsoft para o modo `smtp`. Caso se opte por enviar através do Exchange Online com credenciais de aplicativo, use `CALENDAR_EMAIL_PROVIDER=microsoft365-smtp-oauth2` e siga `calendar-microsoft365-oauth.md`. Instalações antigas com client ID OAuth e sem senha SMTP preservam essa escolha automaticamente.

## Validação

1. A ação `status` da função informa somente nomes de parâmetros ausentes/inválidos; não divulga credenciais nem dispara mensagens. `configured=true` significa preenchimento válido, não autenticação SMTP já testada.
2. Após configurar o serviço, publicar um período revisado enfileira os convites e tenta processar a fila. Salvar rascunhos não envia.
3. Conferir `calendar_invite_jobs`: `sent_provider` com `provider=smtp` e `sent_at` indica aceite pelo servidor SMTP. `provider=superseded` indica descarte de versão anterior, sem envio.
4. Conferir recebimento e aceite no Outlook. O CRM não rastreia entrega na caixa nem respostas Aceito/Recusado.
5. Alterações e cancelamentos usam o mesmo UID e número de sequência para permitir atualização pelo cliente de calendário.

Falhas preservam a fila para nova tentativa. O cron diário existente é uma recuperação de pendências; o fluxo normal tenta enviar logo após a publicação/agendamento.

## Testes sem envio real

Com Node.js 24: `node --test tests/calendar-invites.test.mjs`.

Os testes isolam SMTP e banco: validam configuração, TLS, convite aguardando aceite, erro de destinatário rejeitado, status sem exposição de credenciais e identidade de atualizações/cancelamentos. Não provam entrega no Outlook; a validação real exige credenciais do serviço.
