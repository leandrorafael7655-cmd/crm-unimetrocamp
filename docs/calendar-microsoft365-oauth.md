# UniConecta · Microsoft 365 SMTP OAuth2

O envio de convites do UniConecta usa SMTP AUTH com OAuth2 (client credentials) no Exchange Online.

## Remetente/organizador

O endereço é configurado somente por secret no Supabase. Não deve ser salvo no código-fonte.

## Secrets esperados pela Edge Function

- `CALENDAR_OAUTH_TENANT_ID`
- `CALENDAR_OAUTH_CLIENT_ID`
- `CALENDAR_OAUTH_CLIENT_SECRET`
- `CALENDAR_SMTP_USER`
- `CALENDAR_FROM_EMAIL`
- `CALENDAR_ORGANIZER_EMAIL`
- `CALENDAR_CRM_URL` (opcional; padrão: produção do UniConecta)
- `CALENDAR_SMTP_HOST` (opcional; padrão: `smtp.office365.com`)
- `CALENDAR_SMTP_PORT` (opcional; padrão: `587`)

## Microsoft Entra / Exchange Online

O aplicativo deve possuir `Office 365 Exchange Online > Application permissions > SMTP.SendAsApp`, com consentimento administrativo. O service principal precisa estar registrado no Exchange Online e receber permissão para enviar como a caixa configurada. SMTP AUTH também precisa estar permitido para a caixa/tenant conforme a política da organização.

A Edge Function solicita token usando `client_credentials` e o escopo `https://outlook.office365.com/.default` e autentica SMTP com XOAUTH2.

## Segurança

Nunca commitar tenant/client secret nem token de acesso. Os valores devem ser cadastrados em Edge Function Secrets no projeto Supabase.
