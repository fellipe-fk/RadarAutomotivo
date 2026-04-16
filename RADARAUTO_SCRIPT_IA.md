# ════════════════════════════════════════════════════════════════════
# RADARAUTO — SCRIPT DE EXECUÇÃO PARA IA AGENTE
# ════════════════════════════════════════════════════════════════════
#
# COMO USAR:
#   Cole este arquivo inteiro no Claude Code, Cursor, Windsurf ou
#   qualquer IA agente com acesso ao terminal e ao repositório.
#
#   A IA deve ler, entender e executar cada etapa em ordem.
#   Cada bloco tem: OBJETIVO, VERIFICAÇÃO e AÇÃO.
#
# PROJETO: RadarAuto — SaaS de radar de oportunidades veiculares
# STACK:   Next.js 14 + TypeScript + Prisma + PostgreSQL + Tailwind
# REPO:    https://github.com/fellipe-fk/RadarAutomotivo
# ════════════════════════════════════════════════════════════════════

---

## CONTEXTO DO PROJETO

Você é o **diretor técnico** do RadarAuto. Seu trabalho é analisar
o repositório, identificar exatamente o que está quebrado, o que está
mockado, e executar todas as correções listadas abaixo.

Não pergunte — execute. Se encontrar um problema não listado, corrija
também e documente no final.

---

## ETAPA 0 — LEITURA OBRIGATÓRIA ANTES DE QUALQUER AÇÃO

Leia estes arquivos na ordem antes de começar qualquer mudança:

```
1. prisma/schema.prisma              → entender o modelo de dados
2. src/lib/auth.ts                   → entender autenticação
3. src/lib/radar.ts                  → entender lógica do radar
4. src/lib/listing-extractor.ts      → entender extração de anúncios
5. src/lib/analyzer.ts               → entender análise com IA
6. src/lib/listing-analysis.ts       → entender fallback heurístico
7. src/app/api/radar/scan/route.ts   → entender scan atual
8. src/app/api/alerts/route.ts       → entender alertas
9. src/app/globals.css               → entender design system
10. vercel.json                      → entender configuração de deploy
```

Após ler, confirme o que encontrou em cada arquivo antes de prosseguir.

---

## ETAPA 1 — DIAGNÓSTICO: O QUE VERIFICAR

Execute estas verificações e reporte o resultado de cada uma:

### 1.1 Modelo de IA
```bash
grep -n "OPENAI_MODEL\|gpt-5\|gpt-4\|gpt-3" src/lib/analyzer.ts
```
**Esperado:** `gpt-4o-mini` ou `gpt-4.1-mini`
**Problema:** Se encontrar `gpt-5.2` ou modelo inválido → corrigir

### 1.2 Cron de auto-scan
```bash
cat vercel.json
```
**Esperado:** JSON com `"crons"` configurado apontando para `/api/radar/auto-scan`
**Problema:** Se não tiver `crons` → o radar nunca roda automaticamente

### 1.3 Auto-scan usa requireAuth
```bash
grep -n "requireAuth\|GET\|POST" src/app/api/radar/auto-scan/route.ts
```
**Esperado:** Rota `GET` autenticada via header `Authorization: Bearer CRON_SECRET`
**Problema:** Se usar `requireAuth` com cookie → o Vercel Cron nunca consegue chamar

### 1.4 Mass assignment em alerts
```bash
grep -n "\.\.\.body" src/app/api/alerts/route.ts
```
**Esperado:** Nenhum resultado (já corrigido)
**Problema:** Se `...body` estiver em código (não em comentário) → risco de segurança

### 1.5 Email real
```bash
grep -n "console.log\|RESEND\|fetch.*resend" src/lib/email.ts
```
**Esperado:** Integração real com Resend via fetch
**Problema:** Se só tiver `console.log` → nenhum email é enviado

### 1.6 Asaas vs Abacatepay
```bash
grep -rn "asaas\|ASAAS" src/lib/ src/app/api/ --include="*.ts" | grep -v ".bak" | grep -v "//.*asaas"
```
**Esperado:** Nenhuma referência ativa ao Asaas (substituído pelo Abacatepay)
**Problema:** Se ainda usar Asaas → pagamentos não funcionam em produção

### 1.7 Webhook de pagamento
```bash
ls src/app/api/assinatura/ 2>/dev/null || echo "PASTA NÃO EXISTE"
```
**Esperado:** Pastas `webhook/`, `checkout/`, `cancelar/`, `historico/`
**Problema:** Se não existirem → assinatura não tem fluxo funcional

### 1.8 Mobile / bottom nav
```bash
grep -n "mobile-bottom-nav\|MobileBottomNav\|mobile-fab" src/components/ui/Sidebar.tsx src/app/globals.css 2>/dev/null | wc -l
```
**Esperado:** Pelo menos 10 ocorrências
**Problema:** Se menos de 10 → mobile sem navegação (sidebar some em 768px)

### 1.9 Validação de preço mínimo
```bash
grep -n "isPriceValid\|price >= 2000\|price >= 5000\|candidates" src/lib/listing-extractor.ts
```
**Esperado:** Função `isPriceValid` exportada e lógica de candidatos
**Problema:** Se não existir → sistema captura preços de frete como preço do veículo

### 1.10 Histórico de cobranças fake
```bash
grep -n "buildBillingHistory\|Array.from.*length.*4\|map.*index\|toLocaleDateString" src/app/assinatura/page.tsx | head -5
```
**Esperado:** Nenhuma função gerando datas artificialmente
**Problema:** Se encontrar `buildBillingHistory` → histórico é falso

---

## ETAPA 2 — CORREÇÕES A EXECUTAR

Execute cada correção abaixo. Para cada uma: leia o arquivo atual,
aplique a mudança, confirme que ficou correto.

### CORREÇÃO 1: vercel.json — ativar cron

**Arquivo:** `vercel.json`
**Ação:** Substituir o conteúdo completo por:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/radar/auto-scan",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

**Verificar após:**
```bash
cat vercel.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('crons:', d.get('crons'))"
```

---

### CORREÇÃO 2: auto-scan — sem requireAuth, processa todos usuários

**Arquivo:** `src/app/api/radar/auto-scan/route.ts`
**Problema:** Usa `requireAuth` (requer cookie), mas Vercel Cron não envia cookie.
**Ação:** Reescrever para:
- Método `GET` (não POST)
- Autenticar via `Authorization: Bearer CRON_SECRET`
- Buscar todos os usuários com `radarConfig.ativo = true`
- Para cada usuário: verificar se a frequência configurada já passou desde o último scan
- Processar scan de cada usuário independentemente
- Retornar JSON com summary de quantos foram processados

**Lógica de frequência:**
```typescript
// Checar se deve rodar baseado na frequência configurada
const frequenciaMs = (config.frequenciaMin || 60) * 60 * 1000
const elapsed = lastListing ? Date.now() - lastListing.createdAt.getTime() : Infinity
if (elapsed < frequenciaMs) continue // ainda não está na hora
```

**Verificar após:**
```bash
grep -n "GET\|CRON_SECRET\|frequenciaMs\|assinaturaStatus" src/app/api/radar/auto-scan/route.ts | head -10
```

---

### CORREÇÃO 3: listing-extractor — preço mais alto + validação mínima

**Arquivo:** `src/lib/listing-extractor.ts`
**Problema:** `extractPrice` usa `.match()` e pega o PRIMEIRO valor R$ encontrado,
que pode ser frete, taxa de entrega, etc.

**Ação — dentro de `extractPrice`:** Substituir a extração de regex por:
```typescript
// Extrair TODOS os candidatos e pegar o MAIOR (preço do veículo > frete)
const priceMatches = Array.from(rawText.matchAll(/R\$\s*([\d.\s]+(?:,\d{2})?)/gi))
const candidates = priceMatches
  .map(m => toNumber(m[1] || ''))
  .filter((v): v is number => typeof v === 'number' && v >= 800)
  .sort((a, b) => b - a) // maior primeiro
if (candidates.length > 0) return candidates[0]
return undefined
```

**Ação — adicionar função exportada no final do arquivo:**
```typescript
export function isPriceValid(price: number | undefined, vehicleType: string): boolean {
  if (!price || !Number.isFinite(price)) return false
  if (vehicleType === 'MOTO') return price >= 2000 && price <= 500_000
  if (vehicleType === 'CARRO') return price >= 5000 && price <= 5_000_000
  return price >= 800
}
```

**Verificar após:**
```bash
grep -n "isPriceValid\|candidates\|sort.*b - a" src/lib/listing-extractor.ts
```

---

### CORREÇÃO 4: scan/route.ts — usar isPriceValid

**Arquivo:** `src/app/api/radar/scan/route.ts`

**Ação 1:** Adicionar import:
```typescript
import { extractListingFromUrl, NotAVehicleError, isPriceValid } from '@/lib/listing-extractor'
```

**Ação 2:** Substituir a validação de preço vazia por:
```typescript
const type = inferVehicleType(`${title} ${extracted.brand || ''} ${extracted.model || ''}`)

if (!extracted.price || !isPriceValid(extracted.price, type)) {
  return {
    item: {
      url: sourceUrl, title, status: 'skipped',
      detail: `Preço inválido (${extracted.price ? 'R$ ' + extracted.price : 'ausente'}) para ${type}.`
    },
    alerted: false,
  }
}
```

**Verificar após:**
```bash
grep -n "isPriceValid" src/app/api/radar/scan/route.ts
```

---

### CORREÇÃO 5: dashboard — filtrar margem negativa

**Arquivo:** `src/app/dashboard/page.tsx`

**Problema:** Card mostra "Margem est.: R$ -2.466" — anúncios sem margem
positiva aparecem em "Melhores oportunidades agora".

**Ação:** No `useMemo` que calcula `radarListings`, adicionar filtro:
```typescript
const radarListings = listings.filter((l) => listingMatchesRadar(l, radarConfig))
const positiveListings = radarListings.filter((l) => (l.estimatedMargin ?? 0) > 0)
// Usar positiveListings para exibição e métricas
```

**Verificar após:**
```bash
grep -n "positiveListings\|estimatedMargin.*> 0" src/app/dashboard/page.tsx
```

---

### CORREÇÃO 6: lib/abacatepay.ts — criar integração completa

**Arquivo:** `src/lib/abacatepay.ts` (criar se não existir)

**Deve conter:**
- Constante `PLANOS` com os 6 planos (BASICO/PRO/AGENCIA × MENSAL/ANUAL)
  - Básico Mensal: R$97 → centavos: 9700
  - Básico Anual: R$931 → centavos: 93100 (20% desc)
  - Pro Mensal: R$197 → centavos: 19700
  - Pro Anual: R$1.891 → centavos: 189100 (20% desc)
  - Agência Mensal: R$497 → centavos: 49700
  - Agência Anual: R$4.771 → centavos: 477100 (20% desc)
- `criarOuBuscarCliente(name, email, phone)` → POST /customers
- `criarAssinatura(customerId, planoId, successUrl, cancelUrl)` → POST /subscriptions → retorna `{ subscriptionId, checkoutUrl }`
- `cancelarAssinatura(subscriptionId)` → DELETE /subscriptions/:id
- `processarWebhook(payload)` → mapeia eventos para `activate | renew | cancel | expire`
- `abacatepayConfigured()` → boolean

**Verificar após:**
```bash
grep -n "PLANOS\|criarOuBuscarCliente\|criarAssinatura\|cancelarAssinatura\|processarWebhook" src/lib/abacatepay.ts
```

---

### CORREÇÃO 7: webhook de pagamento

**Arquivo:** `src/app/api/assinatura/webhook/route.ts` (criar se não existir)

**Deve:**
- Método `POST`
- Verificar assinatura HMAC com `ABACATEPAY_WEBHOOK_SECRET` usando `crypto.timingSafeEqual`
- Chamar `processarWebhook(payload)` da lib abacatepay
- Para `activate` / `renew`: atualizar `assinaturaStatus = 'ATIVA'`, `plano`, `assinaturaEndsAt`
- Para `cancel`: atualizar `assinaturaStatus = 'CANCELADA'`
- Para `expire`: atualizar `assinaturaStatus = 'ENCERRADA'`
- Buscar usuário pelo `asaasCustomerId` (campo reaproveitado para customerId do Abacatepay)

**Verificar após:**
```bash
grep -n "timingSafeEqual\|processarWebhook\|ATIVA\|CANCELADA" src/app/api/assinatura/webhook/route.ts
```

---

### CORREÇÃO 8: checkout route

**Arquivo:** `src/app/api/assinatura/checkout/route.ts` (criar se não existir)

**Deve:**
- Método `POST` com `requireAuth`
- Schema Zod: `planoId` como enum dos 6 planos
- Criar ou reutilizar customer no Abacatepay (salvar id em `asaasCustomerId`)
- Chamar `criarAssinatura(...)` e retornar `{ checkoutUrl }`
- Salvar `subscriptionId` em `asaasSubscriptionId`

**Verificar após:**
```bash
grep -n "criarOuBuscarCliente\|criarAssinatura\|checkoutUrl" src/app/api/assinatura/checkout/route.ts
```

---

### CORREÇÃO 9: cancelar e historico routes

**Criar `src/app/api/assinatura/cancelar/route.ts`:**
- POST + requireAuth
- Chama `cancelarAssinatura(dbUser.asaasSubscriptionId)`
- Atualiza `assinaturaStatus = 'CANCELADA'`

**Criar `src/app/api/assinatura/historico/route.ts`:**
- GET + requireAuth
- Retorna `prisma.pagamento.findMany({ where: { userId } })`

**Verificar após:**
```bash
ls src/app/api/assinatura/
```

---

### CORREÇÃO 10: assinatura/page.tsx — dados reais + checkout

**Arquivo:** `src/app/assinatura/page.tsx`

**Remover:**
- Função `buildBillingHistory()` (gera datas falsas)
- Toda referência a datas geradas artificialmente

**Adicionar:**
- `billingCycle` state: `'monthly' | 'yearly'`
- Toggle visual mensal/anual com badge "20% de desconto"
- Buscar histórico real em `/api/assinatura/historico`
- Função `handleCheckout(planoId)` → POST `/api/assinatura/checkout` → redirect para `checkoutUrl`
- Função `handleCancelamento()` → POST `/api/assinatura/cancelar`
- `searchParams` para detectar `?success=1` e `?cancelled=1` pós-pagamento

**Verificar após:**
```bash
grep -n "billingCycle\|handleCheckout\|historico\|buildBillingHistory" src/app/assinatura/page.tsx
```

---

### CORREÇÃO 11: email.ts — integração real com Resend

**Arquivo:** `src/lib/email.ts`

**Remover:**
- Qualquer `console.log` como implementação de envio

**Implementar via fetch para `https://api.resend.com/emails`:**
```typescript
const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
  },
  body: JSON.stringify({ from, to, subject, html }),
})
```

**Funções a implementar:**
- `sendWelcomeEmail(email, name)` — boas-vindas com CTA para /dashboard
- `sendTrialEndingEmail(email, name, daysLeft)` — aviso com CTA para /assinatura
- `sendAlertEmail(email, listing)` — notificação de oportunidade

**Se `RESEND_API_KEY` não configurado:** logar e retornar `{ sent: false }` sem lançar erro.

**Verificar após:**
```bash
grep -n "resend.com\|RESEND_API_KEY\|sendWelcomeEmail\|sendTrialEndingEmail" src/lib/email.ts
```

---

### CORREÇÃO 12: mobile — bottom navigation

**Arquivo:** `src/app/globals.css`
**Adicionar ao final do arquivo:**

```css
/* ── MOBILE BOTTOM NAVIGATION ────────────────────────────── */
.mobile-bottom-nav {
  display: none;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 64px;
  background: #fff;
  border-top: 1px solid #e8e8e5;
  z-index: 200;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-shadow: 0 -2px 20px rgba(0,0,0,.08);
}
.mobile-bottom-nav__inner {
  display: flex;
  align-items: stretch;
  height: 64px;
}
.mobile-bnav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #aaa;
  font-size: 10px;
  font-weight: 500;
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  transition: color .15s;
}
.mobile-bnav-item.active { color: #185FA5; }
.mobile-bnav-item svg { width: 22px; height: 22px; }
.mobile-bnav-item__badge {
  position: absolute;
  top: 6px;
  right: calc(50% - 18px);
  background: #185FA5;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 99px;
  min-width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
.mobile-fab {
  display: none;
  position: fixed;
  bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 16px);
  right: 18px;
  width: 54px; height: 54px;
  border-radius: 50%;
  background: #185FA5;
  color: #fff;
  border: none;
  font-size: 28px;
  cursor: pointer;
  z-index: 199;
  box-shadow: 0 4px 20px rgba(24,95,165,.45);
  align-items: center;
  justify-content: center;
  text-decoration: none;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}
.mobile-more-sheet {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 300;
}
.mobile-more-sheet.open { display: block; }
.mobile-more-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.4);
}
.mobile-more-sheet__content {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding: 20px 0 calc(20px + env(safe-area-inset-bottom, 0px));
  max-height: 80vh;
  overflow-y: auto;
}
.mobile-more-sheet__handle {
  width: 40px; height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  margin: 0 auto 20px;
}
.mobile-more-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.mobile-more-item svg { width: 20px; height: 20px; color: #185FA5; flex-shrink: 0; }
.mobile-more-divider { height: 1px; background: #f0f0ee; margin: 8px 24px; }

@media (max-width: 768px) {
  .sidebar { display: none !important; }
  .mobile-bottom-nav { display: flex; }
  .mobile-fab { display: flex; }
  .main-content {
    margin-left: 0 !important;
    padding: 16px 16px calc(80px + env(safe-area-inset-bottom, 0px));
  }
  .dashboard-metric-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
  .plan-cards { grid-template-columns: 1fr !important; }
  .kanban { grid-template-columns: 1fr !important; }
  .radar-config-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .page-header { flex-direction: column; gap: 10px; }
  .page-title { font-size: 18px; }
  .btn { min-height: 40px; }
}
```

**Verificar após:**
```bash
grep -c "mobile-bottom-nav\|mobile-fab\|mobile-more" src/app/globals.css
```
Esperado: 10 ou mais ocorrências.

---

### CORREÇÃO 13: Sidebar.tsx — adicionar MobileBottomNav

**Arquivo:** `src/components/ui/Sidebar.tsx`

**Ação:**
1. No `return` da função `Sidebar`, envolver tudo em `<>...</>` (React Fragment)
2. Após o `</aside>`, adicionar: `<MobileBottomNav pathname={pathname} alertsCount={opportunityCount} isActive={isActive} />`
3. Adicionar a função `MobileBottomNav` como componente separado no mesmo arquivo

**MobileBottomNav deve renderizar:**
- `<nav className="mobile-bottom-nav">` com `mobile-bottom-nav__inner`
- 5 itens: Início (`/dashboard`), Oportunidades (`/oportunidades`), espaço para FAB, Laudo (`/laudo`), Mais (botão que abre bottom sheet)
- `<Link href="/analisar" className="mobile-fab">+</Link>` fora da nav
- Bottom sheet com links para: CRM, Calculadora, Alertas, Radar, Analytics, Integrações, Assinatura, Perfil

**Verificar após:**
```bash
grep -n "MobileBottomNav\|mobile-bottom-nav\|mobile-fab\|mobile-more-sheet" src/components/ui/Sidebar.tsx | wc -l
```
Esperado: 8 ou mais.

---

### CORREÇÃO 14: .env.example — completo e atualizado

**Arquivo:** `.env.example`
**Garantir que contenha todas estas variáveis:**

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="64-chars-hex"
NEXT_PUBLIC_APP_URL="https://radarauto.com.br"
OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4o-mini"
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_CHAT_ID="..."
ABACATEPAY_API_KEY="sk_live_..."
ABACATEPAY_WEBHOOK_SECRET="whsec_..."
ABACATEPAY_BASE_URL="https://api.abacatepay.com/v1"
RESEND_API_KEY="re_..."
RESEND_FROM="RadarAuto <noreply@radarauto.com.br>"
VEHICLE_REPORT_PLACAS_APP_EMAIL="..."
VEHICLE_REPORT_PLACAS_APP_PASSWORD="..."
FIPE_API_URL="https://parallelum.com.br/fipe/api/v1"
CRON_SECRET="32-bytes-hex"
```

**Remover:** Qualquer referência ao `ASAAS_API_KEY`

---

## ETAPA 3 — VERIFICAÇÃO FINAL

Execute este script de verificação completo após todas as correções:

```bash
python3 << 'VERIFY'
import os, subprocess

checks = [
  # (descrição, arquivo, tokens_que_devem_existir, tokens_que_devem_estar_ausentes)
  ("vercel.json com cron",
    "vercel.json",
    ["auto-scan", "*/30"],
    []),
  ("auto-scan sem requireAuth",
    "src/app/api/radar/auto-scan/route.ts",
    ["CRON_SECRET", "frequenciaMs", "GET"],
    ["requireAuth"]),
  ("isPriceValid no extrator",
    "src/lib/listing-extractor.ts",
    ["isPriceValid", "candidates", "b - a"],
    []),
  ("isPriceValid no scan",
    "src/app/api/radar/scan/route.ts",
    ["isPriceValid"],
    []),
  ("margem positiva no dashboard",
    "src/app/dashboard/page.tsx",
    ["positiveListings", "estimatedMargin"],
    []),
  ("Abacatepay lib",
    "src/lib/abacatepay.ts",
    ["criarOuBuscarCliente", "criarAssinatura", "cancelarAssinatura", "processarWebhook"],
    []),
  ("webhook Abacatepay",
    "src/app/api/assinatura/webhook/route.ts",
    ["timingSafeEqual", "ATIVA", "CANCELADA"],
    []),
  ("checkout route",
    "src/app/api/assinatura/checkout/route.ts",
    ["criarAssinatura", "checkoutUrl"],
    []),
  ("email com Resend",
    "src/lib/email.ts",
    ["resend.com", "RESEND_API_KEY", "sendWelcomeEmail"],
    ["console.log(`Boas-vindas"]),
  ("mobile CSS",
    "src/app/globals.css",
    ["mobile-bottom-nav", "mobile-fab", "safe-area-inset-bottom"],
    []),
  ("Sidebar com MobileBottomNav",
    "src/components/ui/Sidebar.tsx",
    ["MobileBottomNav", "mobile-bottom-nav", "mobile-fab"],
    []),
  ("assinatura sem dados fake",
    "src/app/assinatura/page.tsx",
    ["billingCycle", "handleCheckout"],
    ["buildBillingHistory"]),
  (".env.example sem Asaas",
    ".env.example",
    ["ABACATEPAY_API_KEY", "RESEND_API_KEY", "CRON_SECRET"],
    ["ASAAS_API_KEY"]),
]

all_ok = True
print("=" * 60)
print("RADARAUTO — VERIFICAÇÃO FINAL")
print("=" * 60)

for desc, path, must_have, must_not in checks:
    if not os.path.exists(path):
        print(f"❌ ARQUIVO NÃO ENCONTRADO: {path}")
        all_ok = False
        continue
    
    with open(path) as f:
        content = f.read()
    
    issues = []
    for token in must_have:
        if token not in content:
            issues.append(f"FALTA: '{token}'")
    for token in must_not:
        if token in content:
            issues.append(f"DEVE SER REMOVIDO: '{token}'")
    
    if issues:
        print(f"❌ {desc}")
        for i in issues:
            print(f"   → {i}")
        all_ok = False
    else:
        print(f"✅ {desc}")

print("=" * 60)
print("RESULTADO FINAL:", "✅ APROVADO" if all_ok else "❌ HÁ PROBLEMAS — corrija antes de fazer deploy")
print("=" * 60)
VERIFY
```

---

## ETAPA 4 — BUILD E TYPECHECK

Após todas as correções, executar:

```bash
# Instalar dependências se necessário
npm install

# Verificar TypeScript sem compilar
npx tsc --noEmit 2>&1 | head -50

# Tentar build completo
npm run build 2>&1 | tail -30
```

**Se o build falhar:** leia o erro, corrija o arquivo específico e rode novamente.

**Erros comuns esperados e correções:**
- `Cannot find module '@/lib/abacatepay'` → verificar se o arquivo foi criado
- `Property 'alertStats' does not exist` → usar `opportunityCount` que já existe no Sidebar
- `Type 'string' is not assignable to 'MOTO' | 'CARRO'` → verificar cast de tipos no auto-scan
- `Object literal may only specify known properties` → schema Prisma desatualizado, rodar `npx prisma generate`

---

## ETAPA 5 — SCHEMA PRISMA (se necessário)

Se encontrar campos que não existem no schema:

```bash
# Ver schema atual
cat prisma/schema.prisma

# Verificar se asaasSubscriptionId existe no model User
grep -n "asaasSubscriptionId\|asaasCustomerId" prisma/schema.prisma
```

**Se `asaasSubscriptionId` não existir:**
```prisma
model User {
  // ... campos existentes ...
  asaasCustomerId     String?   // reaproveitado para customerId Abacatepay
  asaasSubscriptionId String?   // reaproveitado para subscriptionId Abacatepay
}
```

Após editar o schema:
```bash
npx prisma generate
# Em desenvolvimento:
npx prisma db push
# Em produção (via Vercel): a variável DATABASE_URL fará isso automaticamente
```

---

## ETAPA 6 — RELATÓRIO DO QUE FOI FEITO

Ao finalizar, gere um relatório listando:

1. **O que estava quebrado e foi corrigido** (com nome do arquivo e linha)
2. **O que estava mockado e foi substituído por dados reais**
3. **Novos arquivos criados**
4. **O que ainda precisa de configuração manual** (variáveis de ambiente)
5. **O que não foi possível fazer e por quê**

---

## VARIÁVEIS DE AMBIENTE NECESSÁRIAS PARA PRODUÇÃO

Configurar no painel do Vercel (Settings → Environment Variables):

| Variável | Onde obter |
|---|---|
| `DATABASE_URL` | Neon.tech — painel do projeto |
| `NEXTAUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `OPENAI_API_KEY` | platform.openai.com |
| `TELEGRAM_BOT_TOKEN` | t.me/BotFather |
| `ABACATEPAY_API_KEY` | painel.abacatepay.com |
| `ABACATEPAY_WEBHOOK_SECRET` | configurar webhook no painel Abacatepay |
| `RESEND_API_KEY` | resend.com (plano free: 3000 emails/mês) |
| `VEHICLE_REPORT_PLACAS_APP_EMAIL` | placas.app.br — sua conta |
| `VEHICLE_REPORT_PLACAS_APP_PASSWORD` | placas.app.br — sua senha |
| `CRON_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

---

## NOTAS FINAIS PARA A IA

- **Não perguntar** — se tiver dúvida sobre onde um bloco de código vai, leia o arquivo completo antes de agir
- **Não apagar** funcionalidades que estão funcionando — apenas corrigir o que está listado
- **Testar cada mudança** com o comando de verificação antes de passar para a próxima
- **Manter TypeScript estrito** — não usar `any` ou `@ts-ignore`
- **Preservar o design system** — não alterar classes CSS existentes, apenas adicionar novas
- **Se um arquivo não existir** — criá-lo do zero conforme descrito
- **Se um arquivo já tiver a correção** — confirmar e pular para o próximo
