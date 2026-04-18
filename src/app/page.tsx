import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getUserFromAccessToken } from '@/lib/auth'

const stats = [
  { value: '+8', label: 'fontes monitoradas' },
  { value: '87%', label: 'precisao do score de IA' },
  { value: 'R$ 2.400', label: 'margem media identificada' },
  { value: '< 1h', label: 'para configurar e usar' },
]

const painPoints = [
  {
    title: 'Tempo perdido',
    description:
      'Sem um radar central, voce passa horas navegando entre plataformas para achar poucas oportunidades realmente boas.',
  },
  {
    title: 'Margem desperdicada',
    description:
      'Comprar sem comparar FIPE, distancia, revisao e revenda costuma apertar a margem logo na largada.',
  },
  {
    title: 'Risco de golpe',
    description:
      'Preco estranho, fotos suspeitas e urgencia exagerada precisam de leitura tecnica antes de voce sair para negociar.',
  },
]

const steps = [
  {
    title: 'Escolha o plano',
    description: 'A landing leva para um checkout unico de teste, sem criar conta antes da hora.',
  },
  {
    title: 'Pague no checkout',
    description: 'A AbacatePay confirma o pagamento e redireciona voce para a tela de confirmacao do fluxo.',
  },
  {
    title: 'Crie o acesso',
    description: 'So depois do pagamento confirmado o cadastro abre, e a conta ja nasce com o plano liberado.',
  },
]

const features = [
  'Analise por link ou preenchimento manual',
  'Score de oportunidade e score de risco',
  'Radar com filtros por tipo, preco e distancia',
  'Calculadora de margem e revenda',
  'CRM de oportunidades e historico comercial',
  'Alertas e integracoes com Telegram',
]

const plans = [
  {
    name: 'Plano de teste',
    price: 'R$ 197',
    description: 'Fluxo unico para validar cadastro, checkout e webhook da AbacatePay com menos ruido.',
    items: ['Analises ilimitadas', 'Radar multi-regiao', 'CRM, calculadora e analytics'],
    featured: true,
  },
]

const faqs = [
  {
    question: 'Como funciona o trial?',
    answer:
      'Para o teste atual, voce escolhe o plano, paga no checkout, confirma o pagamento e so depois cria a conta.',
  },
  {
    question: 'O RadarAuto ja analisa anuncios reais?',
    answer:
      'Sim, o fluxo principal de analise e listagens ja existe. Agora estamos expandindo os outros modulos para o mesmo nivel.',
  },
  {
    question: 'Preciso instalar alguma coisa?',
    answer: 'Nao. O sistema roda no navegador e o painel funciona tanto no desktop quanto no celular.',
  },
]

export default async function HomePage() {
  const token = cookies().get('ra_token')?.value

  const user = token ? await getUserFromAccessToken(token) : null

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <div className="marketing-nav__inner">
          <Link href="/" className="marketing-brand">
            <span className="marketing-brand__icon">R</span>
            <span>
              Radar<span>Auto</span>
            </span>
          </Link>

          <nav className="marketing-links">
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#planos">Plano</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="marketing-actions">
            <Link href="/login" className="btn">
              Entrar
            </Link>
            <Link href="/checkout?plan=PRO" className="btn btn-primary">
              Testar gratis
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="marketing-container">
            <span className="marketing-pill">Produto em evolucao com painel operacional ativo</span>
            <h1 className="marketing-hero__title">
              Encontre motos e carros abaixo do mercado antes de todo mundo
            </h1>
            <p className="marketing-hero__subtitle">
              O Radar AutoMoto IA organiza oportunidades, calcula margem, prioriza risco e acelera a decisao de compra.
            </p>

            <div className="marketing-hero__actions">
              <Link href="/checkout?plan=PRO" className="btn btn-primary">
                Ir para o checkout
              </Link>
              <Link href="/login" className="btn marketing-btn--light">
                Entrar no sistema
              </Link>
            </div>

            <div className="marketing-mockup">
              <div className="marketing-mockup__bar">
                <span />
                <span />
                <span />
              </div>

              <div className="marketing-mockup__card marketing-mockup__card--featured">
                <div>
                  <strong>Honda XRE 300 2021</strong>
                  <p>Campinas SP · 38 km · 38.000 km · Score 87</p>
                </div>
                <div className="marketing-mockup__price">
                  <span>R$ 21.900</span>
                  <small>FIPE ~ R$ 24.500</small>
                </div>
              </div>

              <div className="marketing-mockup__card">
                <div>
                  <strong>Honda CB 500F 2020</strong>
                  <p>Jundiai SP · 62 km · Facebook · Score 79</p>
                </div>
                <div className="marketing-mockup__price">
                  <span>R$ 28.500</span>
                  <small>Margem estimada positiva</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-stats">
          <div className="marketing-container marketing-stats__grid">
            {stats.map((item) => (
              <div key={item.label} className="marketing-stat">
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="marketing-section">
          <div className="marketing-container">
            <div className="marketing-heading">
              <span className="marketing-label">O problema</span>
              <h2>Voce perde negocios quando opera no escuro</h2>
              <p>
                O melhor anuncio nao espera. Sem comparacao de mercado, filtro e leitura de risco, a operacao fica lenta e insegura.
              </p>
            </div>

            <div className="marketing-grid marketing-grid--3">
              {painPoints.map((item) => (
                <article key={item.title} className="marketing-card marketing-card--danger">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-section--muted">
          <div className="marketing-container">
            <div className="marketing-heading">
              <span className="marketing-label">Como funciona</span>
              <h2>Um fluxo simples para decidir melhor</h2>
              <p>O layout do sistema foi desenhado para separar cada modulo na sua propria pagina e evitar ruido operacional.</p>
            </div>

            <div className="marketing-grid marketing-grid--3">
              {steps.map((item, index) => (
                <article key={item.title} className="marketing-card marketing-card--step">
                  <span className="marketing-step">{index + 1}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section" id="funcionalidades">
          <div className="marketing-container">
            <div className="marketing-heading">
              <span className="marketing-label">Funcionalidades</span>
              <h2>O painel foi pensado para operacao real</h2>
              <p>Dashboard, oportunidades, analise, CRM, calculadora, radar, alertas e integracoes no mesmo ecossistema.</p>
            </div>

            <div className="marketing-grid marketing-grid--3">
              {features.map((item) => (
                <article key={item} className="marketing-card">
                  <h3>{item}</h3>
                  <p>Modulo desenhado para evoluir do visual de referencia para um fluxo totalmente conectado a dados reais.</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-section--muted" id="planos">
          <div className="marketing-container">
            <div className="marketing-heading">
              <span className="marketing-label">Plano</span>
              <h2>Um plano unico, uma operacao mais clara</h2>
              <p>Padronizamos o produto em um unico plano para simplificar cobranca, onboarding e suporte sem ruido desnecessario.</p>
            </div>

            <div className="marketing-grid" style={{ gridTemplateColumns: 'minmax(280px, 420px)', justifyContent: 'center' }}>
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`marketing-card marketing-card--plan ${plan.featured ? 'is-featured' : ''}`}
                >
                  <div className="marketing-plan__top">
                    <strong>{plan.name}</strong>
                    {plan.featured ? <span className="badge">Mais popular</span> : null}
                  </div>
                  <div className="marketing-plan__price">{plan.price}</div>
                  <p>{plan.description}</p>
                  <ul className="marketing-list">
                    {plan.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <Link href="/checkout?plan=PRO" className={`btn ${plan.featured ? 'btn-primary' : ''}`}>
                    Ir para o checkout
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section" id="faq">
          <div className="marketing-container marketing-container--narrow">
            <div className="marketing-heading">
              <span className="marketing-label">FAQ</span>
              <h2>Perguntas frequentes</h2>
            </div>

            <div className="marketing-faq">
              {faqs.map((item) => (
                <details key={item.question} className="marketing-faq__item">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-cta">
          <div className="marketing-container marketing-container--narrow">
            <h2>Pronto para continuar a evolucao do RadarAuto?</h2>
            <p>Comece pelo checkout, confirme o pagamento e so depois crie a conta para entrar no painel.</p>
            <div className="marketing-hero__actions">
              <Link href="/checkout?plan=PRO" className="btn btn-primary">
                Comecar checkout
              </Link>
              <Link href="/login" className="btn marketing-btn--light">
                Ja tenho conta
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
