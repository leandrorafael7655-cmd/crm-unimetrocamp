# Identidade e endereço do UniConecta

Repositório: `leandrorafael7655-cmd/crm-unimetrocamp`, branch de produção `main`.
Vercel: projeto `unimetrocamp` (`prj_3S87bymfMpozvnYiRK06GlN2mFk3`), equipe `rafaelxavier76-1455s-projects`.
Supabase: `supabase-violet-island` (`snixwajvzaxldglcwnig`).

O endereço `uniconecta.vercel.app` já hospedava outro site em 25/09/2026. A alternativa escolhida é `uniconecta-crm.vercel.app`; ela só estará confirmada depois da atribuição pela Vercel.

## Ordem de ativação

1. Vercel → projeto existente → Settings → Domains: adicionar `uniconecta-crm.vercel.app` ao ambiente Production, mantendo `unimetrocamp.vercel.app`. Não criar outro projeto ou banco.
2. Supabase → Authentication → URL Configuration: alterar Site URL para `https://uniconecta-crm.vercel.app`. Preservar as entradas existentes e adicionar:
   - `https://uniconecta-crm.vercel.app/auth/callback`
   - `https://uniconecta-crm.vercel.app/auth/callback?next=%2Fauth%2Freset-password`
   - `https://uniconecta-crm.vercel.app/auth/callback?next=%2Fdashboard`
   Manter os equivalentes do domínio antigo durante a transição. Conferir os templates de confirmação e recuperação; preservar o mecanismo de token já utilizado.
3. Vercel → Environment Variables → Production: definir `NEXT_PUBLIC_SITE_URL=https://uniconecta-crm.vercel.app`. `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` deve ficar sem valor em produção. Fazer novo deploy para atualizar variáveis públicas compiladas.
4. Se o token público do Mapbox tiver restrição por domínio, incluir o novo endereço na lista existente. Não remover as restrições.
5. No Supabase, atualizar o secret existente `CALENDAR_CRM_URL=https://uniconecta-crm.vercel.app`, usado pela função de convites. Não alterar o remetente, SMTP nem UIDs dos eventos.
6. Validar login de usuário existente, navegação conforme o perfil, solicitação do e-mail de recuperação e redefinição de senha pelo próprio titular.
7. Só então definir `UNICONECTA_REDIRECT_LEGACY_HOST=true` na Vercel e publicar novamente.

## Comportamento do redirecionamento

O proxy redireciona navegação GET/HEAD do host antigo para a mesma rota e query no novo host, usando 307 durante a transição. Endpoints `/auth`, `/api`, `/_next` e requisições de escrita ficam na origem original. Isso preserva callbacks de e-mails antigos e cookies PKCE. Não configurar um redirecionamento global na Vercel antes de expirar esses links.

Cookies de sessão pertencem ao host. No primeiro acesso ao novo endereço, usuários podem precisar entrar novamente com a mesma conta e senha. Não copiar cookies entre hosts nem recriar usuários.

## Dados preservados e reversão

Não há migration SQL. Usuários, perfis, permissões, unidade, endereços, logos cadastrados e dados comerciais permanecem intactos. O campo de logo da unidade continua armazenado, mas a interface exibe a marca UniConecta. As chaves antigas de localStorage foram mantidas para preservar dados locais.

Para desativar a mudança de endereço: definir `UNICONECTA_REDIRECT_LEGACY_HOST=false`, restaurar `NEXT_PUBLIC_SITE_URL` e o Site URL anterior do Supabase e republicar. Manter ambos os domínios no projeto durante a transição.

Validação local do roteamento: `node --test tests/site-migration.test.mjs`.
