# Reuniões B2B: convites por e-mail e Outlook/Teams

## Sem vincular Microsoft 365 (padrão)

A ficha da empresa oferece **Por e-mail — sem vincular conta**. O remetente central do UniConecta envia um convite iCalendar/iMIP ao consultor logado, ao responsável e aos convidados adicionais. Cada pessoa aceita ou recusa no próprio aplicativo de calendário; os botões e a inclusão automática dependem do aplicativo e das configurações do destinatário. O CRM não acessa nem grava diretamente na agenda pessoal.

O consultor é identificado pelo perfil, mas o **organizador do convite de calendário é o remetente central**. Use uma caixa autorizada diferente dos participantes, por exemplo uma conta dedicada à agenda. Não basta escolher qualquer endereço corporativo como remetente. As respostas de calendário seguem para essa caixa; a leitura automática dessas respostas não está incluída. A confirmação no CRM é um registro manual nesse modo.

Reuniões presenciais pedem local. **Online — informar link** permite colar um link já existente de Teams, Meet ou outro serviço. Nenhum link Teams é gerado sem integração Microsoft. O modo Outlook/Teams conectado continua disponível para quem precisa da geração automática e consulta de respostas.

### Ativação do remetente único

Reutilize a configuração de envio de ações/Atendimento em **Supabase → Edge Functions → Secrets**, conforme [calendar-email.md](calendar-email.md). SMTP independente usa `CALENDAR_EMAIL_PROVIDER=smtp`, `CALENDAR_SMTP_HOST`, `CALENDAR_SMTP_PORT`, `CALENDAR_SMTP_USER`, `CALENDAR_SMTP_PASS` e `CALENDAR_FROM_EMAIL`. Configure o domínio/remetente autorizado (SPF/DKIM conforme o provedor). Não é necessário cadastrar aplicativo ou vincular contas Microsoft para esse modo. A configuração existente de SMTP OAuth Microsoft também continua compatível, se já estiver habilitada.

Aplicar a migração `20260929183658_b2b_email_calendar_invites.sql` e publicar a função `send-calendar-invites` com **index.ts e email-meetings.ts**, mantendo `verify_jwt=true`, antes do frontend. Os secrets ficam no servidor e não devem ser enviados no chat.

Sem configuração, a atividade fica salva como envio pendente. Após configurar, use **Tentar enviar novamente**. Os convites já enfileirados também são recuperados pelo cron existente. É possível cancelar um agendamento que ainda não entrou na fila sem disparar convites.

### Atualizações, cancelamentos e falhas

As atividades e `calendar_invite_jobs` existentes são reaproveitadas. Cada destinatário possui seu registro de envio, mas todos recebem o mesmo UID do compromisso. Alterações aumentam a sequência; um participante removido recebe cancelamento e os demais recebem atualização. O remetente original é preservado. Eventos Outlook existentes mantêm seu mecanismo de envio; não se troca a forma de envio de um compromisso existente.

A fila registra o aceite pelo servidor SMTP, que não comprova entrega na caixa, nem aceite do participante. Repetições mantêm UID, sequência e Message-ID. Se o provedor aceitar e a conexão cair antes do registro, uma mensagem pode ser reenviada; o identificador do compromisso permanece o mesmo para atualização no calendário. A apresentação final depende do aplicativo de calendário.

## Fluxo Outlook/Teams conectado (opcional)

Na ficha da empresa, **Responsáveis e reuniões** permite cadastrar e editar vários contatos, escolher o principal e agendar reuniões com participantes adicionais. O organizador vem da sessão autenticada e da conta Microsoft vinculada. Nome e e-mail do organizador não são enviados pelo navegador como fonte de autorização.

O responsável selecionado é obrigatório no convite; os convidados adicionais são opcionais. E-mails repetidos são normalizados e deduplicados. O horário exibido é o de São Paulo; o banco guarda instantes UTC. Reuniões presenciais exigem local. As agendas online geram o link Teams pelo calendário Outlook do organizador.

Neste modo, o botão **Agendar e enviar convites** dispara o envio real pelo Microsoft Graph. Alterações usam o ID existente; cancelamentos usam `/cancel` e mantêm o histórico. Não há uso de SMTP nem da fila iCalendar antiga para estas reuniões.

## Configuração necessária para ativar

1. No Microsoft Entra, registrar um aplicativo Web no tenant da instituição. Pode ser um aplicativo existente se suas políticas permitirem a autorização delegada.
2. Cadastrar como Redirect URI de plataforma **Web**: `https://unimetrocamp.vercel.app/api/microsoft/callback`. Se o domínio do CRM mudar, cadastrar o endereço real e atualizar a variável correspondente. Para homologação, usar uma URI estável de homologação. Não registrar curingas de previews.
3. Adicionar permissões **delegadas** do Microsoft Graph: `User.Read` e `Calendars.ReadWrite`. O fluxo também solicita `openid`, `profile` e `offline_access`. Obter o consentimento administrativo quando a política da instituição exigir. Não é necessário `Mail.Send` ou a permissão de aplicativo SMTP.SendAsApp para este fluxo.
4. Confirmar que cada organizador possui caixa Exchange Online e Teams habilitado no calendário. Ter apenas um endereço de e-mail no CRM não concede essas permissões.
5. Configurar na Vercel, no ambiente correspondente:

| Variável | Conteúdo |
| --- | --- |
| `MICROSOFT_TENANT_ID` | ID do tenant corporativo específico |
| `MICROSOFT_CLIENT_ID` | Application/client ID do aplicativo |
| `MICROSOFT_CLIENT_SECRET` | Valor do segredo do aplicativo, somente no servidor |
| `MICROSOFT_REDIRECT_URI` | URI Web cadastrada no passo 2 |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | Chave aleatória de 32 bytes codificada em base64 |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de servidor já usada pelas ações administrativas |
| `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Configuração existente do CRM |

Gerar a chave de criptografia em ambiente seguro com `openssl rand -base64 32`. Não colocar segredos no Git, no chat, nem em variáveis `NEXT_PUBLIC_*`. A troca dessa chave exige desvincular/reautorizar as contas; planejar a rotação para não interromper reuniões existentes.

6. Aplicar `supabase/migrations/20260929171405_b2b_outlook_teams.sql` antes de publicar esta versão do frontend.
7. Fazer novo deploy após configurar as variáveis. Cada consultor abre uma empresa e seleciona **Vincular Microsoft 365**, com o mesmo e-mail corporativo do perfil. A vinculação utiliza PKCE e estado criptografado vinculado ao usuário autenticado. Os tokens ficam criptografados no banco, acessíveis apenas ao backend.

## Dados e autorização

- `company_contacts`: reaproveitada; adicionados `is_primary` e `observacoes`. Os IDs deixam de ser apagados/recriados em alterações.
- `activities`: reaproveitada para reuniões, organizador, responsável, horários, link Teams, Outlook Event ID, estado de envio e histórico.
- `activity_participants`: convidados adicionais, vinculados à atividade.
- `microsoft_calendar_accounts`: conta e tokens criptografados. Sem concessões de acesso para `anon`/`authenticated`.
- As políticas existentes de leitura são preservadas. Criar reunião ou editar contato exige propriedade da carteira ou gerência e permissão B2B. Editar/cancelar uma reunião exige ser seu organizador.
- Políticas restritivas impedem alterações diretas de reuniões pelo cliente. Funções de persistência são `SECURITY INVOKER` com execução apenas para `service_role`; as Server Actions autenticam e autorizam antes de chamá-las.
- Registros de reunião não podem ser apagados, inclusive por exclusão em cascata da empresa. Cancelar é a operação que preserva o histórico.

## Falhas e respostas

O agendamento guarda uma operação pendente antes de chamar a Microsoft. A criação usa `transactionId` igual ao ID da atividade. Repetições recuperam o evento já criado. O ID do Outlook é persistido antes de finalizar o histórico. Uma falha exibe **Tentar sincronizar**, sem inventar confirmação de envio. Operações concorrentes usam revisão e um bloqueio com validade de cinco minutos. A recuperação é pelo botão; esta mudança não introduz um cron adicional.

**Consultar respostas** consulta o evento do organizador e registra aceite/recusa/talvez por participante. **Confirmada** significa que o responsável convidado aceitou, independentemente dos participantes opcionais. Recusa não é tratada como ausência. **Realizada**, **Não compareceu** e **Reagendamento solicitado** são registros operacionais feitos pelo organizador. Propostas de novo horário são consultadas no Outlook e registradas manualmente no CRM; a integração não lê a caixa de mensagens. Não há espelhamento automático de alterações feitas diretamente no Outlook nesta versão.

Após mudança de horário ou convidados, a reunião volta a **Agendada** até consultar as respostas. Status de envio e status comercial são separados: uma reunião com envio pendente não aparece como sincronizada.

## Limitação Microsoft ao mudar a modalidade

Depois que o evento recebe uma reunião online, o Graph não permite remover sua condição online nem seu provedor. Ao trocar Teams por presencial, o CRM atualiza modalidade, local e pauta **no mesmo evento**, mantém o link original e avisa isso ao consultor. O bloco de reunião da Microsoft é preservado nas edições da descrição. Criar outro evento para contornar essa limitação não faz parte do fluxo.

## Validação

`npm run build` executa os scripts de preparação existentes e a compilação de produção. `npm test` executa testes de domínio, sincronização mockada e migração em PostgreSQL isolado (PGlite), sem destinatários reais. A validação real requer a configuração acima e uma conta Microsoft autorizada.

Roteiro de homologação: cadastrar dois contatos e alternar principal; criar uma reunião presencial só com responsável; criar Teams com dois adicionais; confirmar no Outlook o organizador/link/convite; aceitar pelo responsável e consultar respostas; mudar horário/pauta e remover/adicionar convidado; confirmar que o Event ID é o mesmo; cancelar e conferir o cancelamento recebido e o histórico preservado. Simular erro temporário e repetir a sincronização verificando que não surge outro evento.

Fontes: [Criar evento](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0), [Atualizar evento](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0), [Cancelar evento](https://learn.microsoft.com/en-us/graph/api/event-cancel?view=graph-rest-1.0), [Propriedades de evento](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0), [OAuth com PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
