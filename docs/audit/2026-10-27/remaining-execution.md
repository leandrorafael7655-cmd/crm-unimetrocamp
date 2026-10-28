> Atualização: as decisões e a implementação de 28/10 estão em [final-decisions.md](../2026-10-28/final-decisions.md). As dependências de homologação, fonte B2B, agenda e arquivamento abaixo descrevem o estado anterior a essas decisões. A validação final em produção continua pendente de aprovação.

# Encerramento da execução disponível — 28/10/2026

O PR #27 permanece em rascunho. Não houve merge, publicação, alteração de dados oficiais nem aplicação de migrações nesta etapa. Os 17 achados originais continuam em `execution.json`; as observações novas não foram acrescentadas como achados supostamente pertencentes à auditoria original.

## Trabalho adicional concluído

| Cenário | Resultado comprovado | Evidência |
|---|---|---|
| Rotas sem sessão | Metas, escolas e rotas redirecionaram ao login na aplicação local. | `evidence/browser-access-results.json` |
| Demo | Consultor criou/buscou/editou; recarga confirmou localStorage. Não recebeu exclusão. Gerência excluiu após troca de usuário. Nenhuma requisição Supabase foi enviada. | `evidence/browser-remaining-results.json` |
| Cadastro escolar | CNPJ inválido revelou perda dos campos. Envio do formulário corrigido; teste real confirmou preservação, criação, edição, classificação, busca e recarga, com consulta nova ao banco. | `components/high-school/escola-form.tsx`; evidências anterior/final |
| Captação e agenda | Contato mudou o estado do Kanban e persistiu. Lista e filtro por nome foram preservados. Outra edição não herdou o contato; ação agendada pela interface apareceu na Agenda High School após recarga, somente na edição correta. Banco confirmou uma projeção ativa do principal. | `evidence/browser-remaining-results.json` |
| Mapbox real | Geocodificação/otimização reais e mapa autenticado desenhado, com captura conferida e viewport móvel sem transbordamento. Sem gravações e sem token secreto. | `evidence/mapbox-real-results.json`; `mapbox-browser-results.json`; `mapbox-real-browser.png` |
| Compilação | Cache local do Turbopack falhou ao ser reaberto. Artefatos anteriores preservados; build limpo, tipos e lint dos arquivos passaram. | `evidence/remaining-readiness.json`; `remaining-build.log` |

O roteiro inicial do demo continha dois erros de teste: seletor genérico de diálogo durante a edição e tentativa de exclusão como consultor. Ambos foram corrigidos no roteiro, preservando as permissões do produto. O seletor da classificação escolar também foi ajustado ao `name` do campo. A perda dos campos após erro de CNPJ foi a falha comprovada do CRM e recebeu correção no componente. A suíte responsiva de CI ganhou a regressão de preservação dos campos com erro de gravação controlado, nos dois navegadores.

Os 12 cenários anteriores de metas, perfis e responsividade autenticada não foram repetidos. CI #26, no SHA `cce9393`, passou com 225 testes Vitest, 20 Node e 2410 verificações Chromium/WebKit com backend simulado. O resultado do CI de cada novo SHA fica vinculado na descrição do PR, sem atribuir um resultado de outra revisão ao código atual.

## Pendências que exigem insumo externo ou definição operacional

| Achados / funcionalidades | Impedimento verificado | Insumo necessário | Critério para encerrar |
|---|---|---|---|
| ACCESS-02 / QA-01; F07, F09, F26, F29, F41 | Não há chave administrativa local da homologação nem variável específica da branch na Vercel. As variáveis padrão da Vercel incluem uma chave administrativa e URL do banco oficial, com escopo também de preview/development; não foram reutilizadas. O conector Supabase disponibiliza chaves públicas, não uma credencial administrativa isolada. | Configurar `SUPABASE_SERVICE_ROLE_KEY` do projeto `ktmcksngmhxtdnxunntl` somente no servidor de teste, por meio seguro. Não enviar pelo chat. | Executar CRUD administrativo legítimo, redefinição temporária, auditoria, telas de Atendimento/Minha Agenda e nova autenticação, com usuários fictícios e sem destinatários reais. |
| INT-01 / QA-01; F05, F33 | Não existe caixa coletora utilizável pelo executor. Auth informa e-mail habilitado; isso não comprova SMTP, entrega, link, expiração ou cancelamento recebido. Secrets de SMTP das Edge Functions não foram recuperados nem considerados válidos por suposição. | Caixa(s) de teste e configuração segura de Auth/SMTP/remetente, templates e redirect URLs de homologação. | Solicitar e receber recuperação; testar uso único/expiração e senha efetiva. Receber criação, atualização e cancelamento do mesmo UID de convite. |
| INT-01; F03, F34 | Azure está desabilitado nas configurações públicas de Auth da homologação; OAuth/Graph/Teams e tenant não estão disponíveis para teste. Login SSO obrigatório não foi confirmado. | Confirmar uso do modo iCalendar ou Microsoft conectado; para Microsoft, aplicativo/consentimento, conta Exchange/Teams de teste e variáveis seguras descritas em `docs/b2b-outlook-teams.md`. | Autorização real, organizador correto, mesmo Event ID após atualização, cancelamento e confirmação na caixa de teste. Não certificar SSO ou Graph com mocks. |
| OPS-01; F28 | Distribuição pessoal não pode ser finalizada sem preferências e restrições. GDC de todos simultaneamente deixa zero pessoas disponíveis na SM durante essa hora. | Preferências/restrições dos seis consultores, vínculo do sétimo, rodízio e horário do GDC, com pausa de atendimento ou cobertura externa definida. | Prévia atende 42h líquidas, almoço, cobertura 3/2 e eventos. Aprovar responsáveis antes de qualquer publicação; não atribuir as 61 ocorrências sem usuário por suposição. |
| AGENDA-01 / AGENDA-02; F30, F31 | Agenda High School e reservas escolares funcionam; não há regra confirmada que defina quais compromissos B2B entram na visão única e quais blocos podem conter visitas. | Definir inclusão de reuniões com intervalo, follow-ups sem horário e exceções de sobreposição entre escola, B2B, escala e ausência. | Testar cenário aprovado em duas sessões concorrentes, sem duplicar eventos e sem mostrar dados alheios. |
| METRIC-01; F39, F40 | Não há origem/atribuição transacional aprovada das inscrições B2B nem snapshot oficial de reconciliação fornecido. | Confirmar fonte oficial, vínculo ao consultor/empresa/edição, regra de atribuição e amostra conhecida. | Total calculado reconcilia com a amostra; zero é medido, ausência de origem permanece indisponível; histórico não duplica resultado. |
| F13 e F20 | Exclusão física B2B com histórico é protegida pela FK existente; exclusão escolar pela interface não foi executada. | Definir arquivamento versus descarte autorizado, retenção e apresentação das escolas/empresas encerradas. | Remoção permitida não perde histórico; ação recusada mantém dados e informa a recusa. Não retirar FKs para completar um teste. |

## Implantação continua reservada à revisão

As oito migrações e a ordem de aplicação permanecem em `deployment.md`, sem alterações nesta etapa. A publicação depende de revisão do PR e de uma janela de implantação aprovada. As verificações autenticadas da versão publicada continuam não testadas: homologação não certifica produção.

Para retomar os itens externos, basta disponibilizar a configuração segura de homologação e reunir as definições operacionais da tabela. Não é necessário enviar senhas ou tokens no chat.
