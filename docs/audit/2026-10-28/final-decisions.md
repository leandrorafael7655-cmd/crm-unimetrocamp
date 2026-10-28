# Decisões finais do PR #27 — 28/10/2026

Implementação na branch `codex/fix-audit-20261027`, a partir de `67b753e`. PR permanece rascunho; produção não foi alterada nesta etapa. A decisão de testar a versão final em produção substitui a dependência de provisionar outra homologação. Testes locais com dados fictícios continuam separados de aceite com Auth e banco oficiais.

## Variáveis exatas para cadastrar no Vercel, ambiente Production

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=smunimetrocampwyden@gmail.com
SMTP_PASS=<cadastrar a senha de app diretamente no Vercel>
EMAIL_FROM=smunimetrocampwyden@gmail.com
```

Durante o aceite, usar também `CALENDAR_TEST_USER_ID` com o UUID do perfil confirmado de Rafael. Essa variável operacional limita cron e processamento manual a esse perfil; não é senha. Retirá-la somente depois de verificar os convites e revisar a fila anterior, para evitar disparos acumulados à equipe.

`EMAIL_ORGANIZER` é opcional e usa `EMAIL_FROM` quando ausente. Porta 465 ativa TLS desde a conexão; certificado continua validado. `UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS` deve ficar `false` para o envio aprovado e `true` quando for necessário pausar o envio. `SUPABASE_SERVICE_ROLE_KEY` continua somente no servidor para consumir a fila; `CRON_SECRET` protege a rotina de tentativas. Nunca usar nomes `NEXT_PUBLIC_` para credenciais. Os nomes antigos `CALENDAR_SMTP_*`/`CALENDAR_FROM_EMAIL` são somente fallback de compatibilidade no servidor Vercel; a configuração recomendada é a acima.

As variáveis do aplicativo **não configuram o e-mail de recuperação do Supabase Auth**. Para recuperar acesso, configurar o SMTP/remetente também no painel Auth do Supabase e validar redirects/templates e recebimento. Não são necessários tenant, OAuth Microsoft, Graph ou Teams para os convites escolhidos. Um link de reunião online pode ser informado manualmente.

## Comportamento implementado

| Decisão | Implementação e limite de validação |
|---|---|
| Convites por e-mail | Reaproveita `calendar_events` e `calendar_invite_jobs`; Vercel processa SMTP. Convite da agenda vai ao responsável cadastrado; reunião B2B não envia a contatos da empresa. Aposenta o consumidor Edge para evitar processamento paralelo. Testes locais verificam o envelope, MIME, REQUEST/CANCEL, São Paulo, UID e SEQUENCE; entrega Gmail/Outlook real continua pendente. |
| Falhas de envio | Compromisso e fila são persistidos antes do envio. Erro sanitizado e próxima tentativa ficam registrados; gestor vê as falhas em Atendimento, e a ficha da reunião conserva o status. Lease e exclusividade por origem protegem processadores concorrentes; recuperação de processamento interrompido tem teste local. |
| Tentativas | Tenta após gravação e pela rotina cron já existente, além do reprocessamento autorizado. O cron existente foi mantido, sem assumir um plano Vercel que permita frequência maior. A fila mantém UID e Message-ID em tentativas; SMTP não oferece garantia de entrega exatamente uma vez se a resposta se perder. |
| Metas B2B manuais | `/gestao/metas/b2b`, acessível pela Central de Metas. Por empresa, consultor e ciclo comercial; alvo e inscrições independentes, vazio diferente de zero. Gerente grava; supervisor não recebe essa permissão nova; consultor lê os próprios resultados e histórico. Autor/data/revisão são carimbados no banco. Edição antiga não sobrescreve uma revisão nova. |
| Indicadores | A meta B2B existente usa os lançamentos do ciclo comercial selecionado. Fonte/lançamento ausente continua indisponível, em vez de zero inventado. O cálculo residual do SuperVest não mistura ciclos comerciais e edições diferentes sem um vínculo explícito. |
| Agenda consolidada | Atendimento/Minha Agenda incluem ações escolares, reuniões B2B, próximos passos com data e ações empresariais já realizadas. Follow-up sem horário usa evento de dia inteiro, sem inventar duração. Ação empresarial histórica conserva seu horário conhecido, sem gerar convite retroativo. |
| Conflitos | Reservas externas no banco cruzam ações escolares, reuniões, próximos passos marcados como externos e atendimento externo publicado. Tarefas internas podem coincidir; intervalos adjacentes são permitidos. Mudar apenas o tipo interno/externo também revalida a reserva. Próximos passos antigos não são classificados por suposição. |
| Compromisso avulso | A criação manual de um compromisso confirma apenas aquele registro e sua fila atomicamente, sem publicar uma escala coletiva ou depender da distribuição pessoal futura. Exige responsável ativo com e-mail e intervalo válido. |
| Arquivamento | Campos e histórico em empresas/escolas; arquivadas saem das listas ativas, captação, mapa, sugestões e fila. Filtro/lista de arquivadas e opção Reativar preservam IDs, contatos, convênios e histórico. Trigger bloqueia DELETE físico inclusive por atalhos antigos. Convênio ativo não altera arquivamento. |
| Escala | Permanece sem distribuição pessoal nova; as preferências, sábados e GDC serão enviados depois. O apagamento autorizado de 249 lançamentos e um ciclo em 28/10 ocorreu antes desta etapa e foi documentado separadamente. Não reutilizar os números antigos 246/61 como contagem atual. |

## Publicação

O [plano por migração e de recuperação](migration-recovery.md) explica as 12 etapas, o backup completo e o aceite no período sem uso. Cadastrar as variáveis não publica este PR. A publicação e as migrações oficiais aguardam a aprovação do responsável.

O teste final de recebimento/calendário no perfil Rafael ainda não foi realizado. Ele será executado depois da configuração e da publicação aprovada, com somente os dois eventos fictícios solicitados e seus respectivos testes de atualização/cancelamento. Não declarar Microsoft ou confirmação de recebimento a partir de um mock ou de um aceite SMTP.

## Evidências desta implementação

- 261 testes Vitest em 37 arquivos e 10 testes Node passaram; Auth simulado nos testes de PostgreSQL local.
- Tipos, lint e build passaram; lint conserva 19 avisos anteriores e zero erros. Auditoria de 158 dependências de produção: zero avisos de segurança reportados pelo registry.
- Última verificação visual local: 445 checagens Chromium, zero falhas, nos quatro cenários alterados e oito larguras entre 320 e 1920 px, com backend simulado. A execução anterior de 701 checagens não foi somada a esse resultado.
- Evidências e hashes: [`evidence/local-validation.json`](evidence/local-validation.json) e [`evidence/manifest.json`](evidence/manifest.json). A comparação anterior que reproduziu a troca de tipo sem revalidar está preservada em `before-kind-validation.log`; a implementação posterior passa na regressão.
- [Tabela dos 17 achados](findings.md) e [matriz das 47 funcionalidades](../2026-10-27/matrix-updated.md), com distinção entre teste local e aceite oficial pendente.

A revisão seguinte acrescenta `CALENDAR_TEST_USER_ID` para limitar os envios do aceite em produção ao perfil verificado (três testes novos). O CI #29, em `ee90a7a`, passou instalação/tipos/lint/build/testes e encontrou 14 transbordamentos no formulário B2B no WebKit entre 2474 checagens. A largura dos campos e da grade foi corrigida, conservando as verificações; a conclusão depende do CI da revisão posterior, vinculado no PR. A evidência do erro foi preservada em `evidence/ci29-failure.log`. O banner do modo de teste passou em 373 verificações locais Chromium, sem somar execuções diferentes.

O CI #30 repetiu a falha visual. A inspeção de geometria no WebKit local confirmou o texto nativo do seletor ultrapassando a área do campo; as caixas dos elementos estavam dentro da janela. O tratamento foi corrigido no próprio controle e a identidade passou a somente leitura na edição. Cadastro com nome longo selecionado, rejeição de salvamento, edição e histórico passaram em **325 checagens WebKit e 325 Chromium**, em execuções separadas. Evidências: `webkit-native-select-before.json`, `webkit-layout-after.log`, `chromium-layout-after.log`. O executor do CI não recebeu dispensa de nenhuma verificação; o resultado final fica vinculado à revisão exata no PR.
