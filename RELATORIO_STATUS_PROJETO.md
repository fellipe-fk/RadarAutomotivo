# Relatorio Atual - Radar AutoMoto IA

## Visao geral

O projeto esta em uma fase funcional de MVP avancado.
Ja existe autenticacao, painel protegido, analise de anuncios, radar com scan real por URLs monitoradas, CRM, alertas, dashboard e publicacao em Next.js 14 com Prisma/PostgreSQL.

Hoje o sistema ja funciona para uso interno e validacao de fluxo.
Ele ainda nao esta 100% igual ao layout do `system.html` e ainda possui alguns modulos que dependem de integracao externa real para sair do modo parcial.

## O que ja foi feito

### Base tecnica

- App em Next.js 14 com App Router
- Prisma com PostgreSQL
- Autenticacao com sessao e middleware de protecao
- Login, cadastro e logout funcionando
- Rotas de API para auth, listings, alerts, CRM, laudo, scan do radar e status do sistema
- Build de producao validada com sucesso

### IA e analise

- Remocao da Anthropic do projeto
- OpenAI como unica IA externa do sistema
- Chave central do servidor, sem dependencia de chave no navegador
- Analise manual de anuncios por URL ou preenchimento manual
- Extracao real de dados do anuncio a partir da pagina
- Fallback local automatizado quando a IA principal falha

### Radar, oportunidades e painel

- Radar com configuracao persistida no banco
- Radar com URLs monitoradas salvas no banco
- Endpoint de scan real em `/api/radar/scan`
- Criacao e atualizacao real de `Listing` pelo scan
- `Dashboard`, `Oportunidades`, `Alertas` e `Sidebar` consumindo dados reais
- Centralizacao da logica do radar em `src/lib/radar.ts`

### CRM e operacao

- API de CRM com persistencia real
- Pipeline por status: interesse, negociando, comprado e revendido
- Resumo financeiro real do CRM
- Favoritos e descarte de listagens persistidos

### Perfil, integracoes e assinatura

- Perfil lendo e salvando dados reais do usuario
- Tela de integracoes refletindo estado do sistema
- Assinatura e billing com base estrutural pronta

## O que esta parcialmente pronto

### Layout

- O visual geral ja conversa com o exemplo
- Sidebar, cards, paginas principais e fluxo estao mais proximos do prototipo
- Ainda nao existe paridade pixel a pixel com `system.html`

### Radar real

- Ja existe scan real por URLs monitoradas
- Ainda nao existe crawler continuo e automatico por fonte
- O radar ainda depende da lista de URLs que o usuario cadastrar

### Alertas

- Historico e estatisticas reais do banco
- Envio Telegram pronto
- WhatsApp e email ainda nao estao completos ponta a ponta

### Laudo

- Tela funcional e integrada ao sistema
- Persistencia no banco funcionando
- Ainda usa geracao interna deterministica
- Nao ha integracao real com fornecedor externo de laudo veicular

## O que falta para ficar 100% funcional

### Integracoes externas reais

- Integrar laudo com fornecedor real
- Fechar integracao completa com Asaas
- Fechar integracao real de WhatsApp
- Fechar envio real de email

### Radar de mercado

- Descoberta automatica de anuncios sem depender de URLs cadastradas manualmente
- Reprocessamento periodico em background
- Controle melhor de deduplicacao e mudanca de preco

### Produto

- Politica real de creditos do laudo
- Regras mais completas de assinatura por plano
- Historico operacional mais robusto
- Observabilidade e tratamento de erro mais refinados

## O que precisa ser corrigido para ficar igual ao exemplo

### Visual

- Ajustar espacos, densidade e hierarquia visual do dashboard
- Aproximar mais o desenho das seções do `system.html`
- Refinar `analytics`, `perfil`, `assinatura` e `integracoes`
- Melhorar consistencia de badges, status, titulos e blocos laterais

### Experiencia

- Deixar o dashboard mais rico, com mais blocos e organizacao semelhante ao layout de referencia
- Refinar o ritmo visual dos cards para ficar mais proximo do mock
- Uniformizar melhor os estados vazios e mensagens operacionais

## Riscos e pontos de atencao

- O projeto declara Node `>=18 <23`, mas a maquina atual estava usando Node 24
- A extracao de marketplaces como Facebook pode variar conforme o HTML da pagina
- A OpenAI depende de billing ativo para analise principal
- Ainda nao ha suite de testes automatizados cobrindo os fluxos principais

## Pendencias prioritarias sugeridas

1. Integrar laudo real
2. Refinar o dashboard para ficar mais proximo do `system.html`
3. Automatizar descoberta de anuncios no radar
4. Completar WhatsApp, email e billing real
5. Adicionar testes de smoke e fluxos principais

## Estado de versionamento local

- Repositorio Git local inicializado
- Commit base criado localmente
- Aguardando repositorio remoto no GitHub para `push`
