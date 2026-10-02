# UniConecta — recuperação e gestão de acesso

Data: 02/10/2026. Validação automatizada: 189 testes aprovados (169 Vitest + 20 Node); build de produção aprovado.

## Causa encontrada no código

O callback anterior só aceitava `code` (PKCE). A recuperação administrativa utilizava um cliente Supabase com fluxo implícito, que retorna `access_token` e `refresh_token` no fragmento da URL. O callback executado no servidor não recebe esse fragmento e redirecionava ao login por ausência de código. A recuperação solicitada no navegador também dependia do verificador PKCE do navegador original. A tela de redefinição apenas consultava uma sessão existente; não consumia o retorno do provedor. A solicitação apresentava sucesso inclusive quando o envio falhava.

## Correção

- Recuperação pública enviada pelo servidor com cliente público isolado e fluxo implícito; funciona em outro navegador, sem transportar o verificador PKCE.
- Destino do e-mail usa a origem pública configurada, com fallback para `https://uniconecta-crm.vercel.app`; não usa Host fornecido pelo visitante nem domínio de preview.
- Callback trata código PKCE legado, `token_hash` de recuperação e sessão no fragmento, validando usuário e sessão com Supabase Auth. Tokens são removidos da URL antes de navegar; não há logs de credenciais.
- Cookie de autorização de recuperação assinado, HttpOnly, vinculado a usuário e sessão, com validade de 20 minutos. Uma sessão comum não abre a redefinição.
- Nova senha e confirmação, controles de exibir/ocultar, validação no navegador e servidor: mínimo de 12 caracteres, maiúscula, minúscula, número e símbolo; máximo 128. O provedor ainda pode recusar senhas conforme sua política.
- Troca própria exige senha atual; a verificação ocorre em cliente isolado do mesmo provedor. Sucesso depende da resposta efetiva do Auth. Após a troca, sessões são encerradas e o usuário volta ao login.
- Alteração administrativa do e-mail de login também é restrita ao Gerente Comercial, impedindo desvio da recuperação para outro endereço. O envio inicial ao cadastrar um colaborador usa a mesma auditoria.
- Gerente Comercial pode enviar recuperação ao usuário selecionado ou gerar senha temporária forte. Supervisor, Consultor B2B e High School são bloqueados no servidor. A senha temporária aparece apenas no retorno da criação e pode ser copiada; não existe leitura de senha anterior.
- Troca obrigatória protegida em ações do servidor, middleware, políticas restritivas RLS e verificação anterior às requisições do Data API, incluindo RPCs SECURITY DEFINER. Alterações diretas do perfil não removem a obrigação.
- A flag é liberada por um trigger somente após mudança efetiva da senha no Auth. Operações administrativas ficam bloqueadas durante a chamada ao provedor.
- Histórico permanente com operador, colaborador, operação, resultado e timestamps; sem campo de senha ou token. Escrita administrativa somente no servidor; leitura limitada à Gerência.
- Rotas de autenticação sem cache, sem referenciador e excluídas da análise de navegação.

## Caminhos reais

| Tela | Caminho |
|---|---|
| Login e Esqueci minha senha | `/auth/login` e `/auth/login?modo=recuperar` |
| Validar retorno do Supabase | `/auth/callback` |
| Redefinir senha / troca de senha temporária | `/auth/reset-password` |
| Meu perfil | `/perfil` |
| Alterar minha senha | `/perfil/alterar-senha` |
| Gestão de usuários e histórico | CRM principal `/` → **Equipe e links** → **Gestão de usuários** |

`/gestao/configuracoes` é a tela de diagnóstico/configurações do sistema, não a gestão de usuários.

## Resultados

| Verificação | Resultado | Evidência / limite |
|---|---|---|
| Tratamento de PKCE, token_hash e fragmento | Passou em teste automatizado | Três caminhos chamam Auth e validam identidade/sessão; o provedor foi simulado nos testes unitários |
| Links inválidos, expirados e reutilizados | Passou em teste automatizado | Resposta de erro não concede autorização, inclusive com usuário já autenticado |
| Sessão comum não autoriza recuperação | Passou | A atualização não é chamada sem prova válida ou troca obrigatória |
| Validação de requisitos e confirmação | Passou | Testes de força, divergência e recusa de senha igual |
| Confirmação somente após atualização | Passou com provedor simulado | Erro do Auth não retorna sucesso; encerramento das sessões após sucesso |
| Verificação da senha atual | Passou com provedor simulado | Senha incorreta bloqueia a atualização |
| Erro de envio de e-mail | Passou com provedor simulado | Interface recebe falha; o sistema não confirma envio recusado |
| Gerente envia recuperação e cria senha temporária | Passou com provedor simulado | Auditoria obrigatória; retorno único da senha após atualização confirmada |
| Supervisor, Consultor e High School sem permissão | Passou | Testes invocam diretamente operações do servidor; nenhum acesso ao cliente administrativo |
| Troca obrigatória no banco | Passou em Postgres local | PGlite testa RLS, pré-requisição, estado protegido e liberação após mudança de hash no Auth simulado |
| Auditoria sem senha e sem edição pelos usuários | Passou | Testes de ausência de senha nas escritas, bloqueio de INSERT/DELETE e restrição de leitura |
| Migração no banco do CRM | Passou | Trigger ativo, auditoria com RLS, pré-requisição configurada e 51 políticas de bloqueio; nenhum usuário real teve senha alterada |
| Login → Esqueci minha senha | Passou na interface publicada | Campos de e-mail e botão Enviar link de redefinição visíveis |
| Erro de link expirado e solicitar outro link | Passou na interface publicada | Callback com erro simulado do provedor exibiu mensagem clara; botão abriu o formulário de recuperação |
| Perfil sem sessão | Passou na interface publicada | `/perfil` redirecionou a `/auth/login?next=%2Fperfil` |
| Perfil e gestão com usuário autenticado | Não verificado na interface | A sessão do CRM encerrou; não houve novo login durante a validação |
| Solicitação e recebimento real do e-mail | Não verificado | Não há caixa de e-mail de teste conectada; autenticação no painel foi recusada |
| Abrir e-mail sem login e salvar senha de conta real de teste | Não verificado | Não houve acesso ao painel nem credenciais de conta de teste; não foi substituído por simulação apresentada como teste real |
| Login com nova senha e rejeição da antiga | Não verificado no provedor real | Depende da execução com uma conta de teste do Supabase |
| Expiração e reutilização reais do link | Não verificado no provedor real | Depende de link emitido pelo projeto e acesso à caixa de teste |
| Recuperação administrativa e senha temporária de conta real | Não verificado no provedor real | Operações implementadas e testadas automaticamente; execução real permanece pendente |

## Configuração externa ainda não inspecionada

A entrada no painel Supabase foi recusada pelo formulário seguro. Portanto não é possível afirmar que as seguintes configurações já estão corretas ou ausentes:

1. **Authentication → URL Configuration:** Site URL `https://uniconecta-crm.vercel.app`; permitir o destino exato `https://uniconecta-crm.vercel.app/auth/callback?next=%2Fauth%2Freset-password` e, se usado por um template direto, `https://uniconecta-crm.vercel.app/auth/reset-password`. Não trocar por localhost ou página inicial.
2. **Authentication → Email Templates → Reset Password:** o link padrão deve usar `{{ .ConfirmationURL }}`. Um link que só usa `{{ .SiteURL }}` não valida a recuperação. O código também aceita um template direto para a tela de redefinição usando `token_hash={{ .TokenHash }}&type=recovery`.
3. **Authentication → Email / SMTP:** conferir o provedor já utilizado, endereço remetente e entrega a uma caixa de teste. O aceite da solicitação pelo Auth não comprova recebimento na caixa. Nenhuma credencial SMTP precisa ser exposta no navegador.
4. Executar com contas de teste o ciclo completo: solicitação → caixa de entrada → abrir em navegador sem sessão → nova senha → login novo → senha antiga recusada → reutilização/expiração → recuperação pelo gerente → senha temporária → bloqueio do CRM → troca obrigatória → acesso liberado.

Não considerar a validação ponta a ponta concluída até estes passos reais serem executados.
