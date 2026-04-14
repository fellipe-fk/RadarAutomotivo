# RadarAutoMoto IA

Radar de oportunidades para revenda de motos e carros com análise por IA, cálculo de margem, alertas e automação de scan.

## Visão geral

O projeto reúne:

- página institucional e fluxo de autenticação;
- dashboard operacional;
- radar de oportunidades;
- análise de anúncios;
- analytics;
- CRM e calculadora;
- integrações com alertas e status do sistema.

## Estrutura principal

- `src/app/page.tsx` — landing page.
- `src/app/dashboard/page.tsx` — painel principal.
- `src/app/radar/page.tsx` — configurações e execução do radar.
- `src/app/analytics/page.tsx` — métricas e leitura do comportamento do radar.
- `src/app/api/radar/scan/route.ts` — scan manual e enriquecimento dos anúncios.
- `src/app/api/radar/auto-scan/route.ts` — auto-scan por frequência.
- `src/app/api/alerts/route.ts` — configurações e preview de alertas.
- `src/app/api/system/status/route.ts` — status consolidado do sistema.
- `src/lib/radar.ts` — configuração, regras e matching do radar.

## Funcionalidades

- análise de anúncios por link ou formulário manual;
- radar com filtros por modelos, fontes, tipo, preço, quilometragem, distância, margem e risco;
- auto-scan respeitando frequência e estado de pausa;
- alertas e histórico;
- analytics com leitura de performance;
- interface responsiva e focada em operação.

## Observações técnicas

- o fluxo do radar está preparado para operação real com dados analisados;
- o auto-scan existe internamente como endpoint e pode ser integrado a uma rotina periódica;
- a aplicação foi desenhada para funcionar sem depender de Vercel nesta etapa.

## Desenvolvimento

Instale as dependências e rode o projeto normalmente pelo gerenciador usado no ambiente atual.
