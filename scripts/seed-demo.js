const bcrypt = require('bcryptjs')
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env')

  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    const value = rawValue.replace(/^"(.*)"$/, '$1')

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile()

const prisma = new PrismaClient()

const DEMO_EMAIL = 'demo@radarauto.com.br'
const DEMO_PASSWORD = 'Radar123A'

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  })

  if (existingUser) {
    await prisma.auditLog.deleteMany({ where: { userId: existingUser.id } })
    await prisma.session.deleteMany({ where: { userId: existingUser.id } })
    await prisma.pagamento.deleteMany({ where: { userId: existingUser.id } })
    await prisma.laudo.deleteMany({ where: { userId: existingUser.id } })
    await prisma.crmItem.deleteMany({ where: { userId: existingUser.id } })
    await prisma.alert.deleteMany({ where: { userId: existingUser.id } })
    await prisma.listing.deleteMany({ where: { userId: existingUser.id } })
    await prisma.radarConfig.deleteMany({ where: { userId: existingUser.id } })
    await prisma.user.delete({ where: { id: existingUser.id } })
  }

  const now = Date.now()

  const user = await prisma.user.create({
    data: {
      name: 'Conta Demo RadarAuto',
      email: DEMO_EMAIL,
      password: passwordHash,
      phone: '11999990000',
      city: 'Campinas',
      state: 'SP',
      plano: 'PRO',
      assinaturaStatus: 'ATIVA',
      trialEndsAt: null,
      creditosLaudo: 5,
      raioKm: 180,
      consumoKmL: 13.4,
      telegramEnabled: false,
      whatsappEnabled: true,
      emailAlertas: true,
      silencioNoturno: false,
      margemMinima: 2000,
      focoTipo: 'TODOS',
      radarConfig: {
        create: {
          ativo: true,
          modelos: ['XRE 300', 'CB 500F', 'Nivus', 'Corolla'],
          fontes: ['olx', 'facebook', 'webmotors'],
          tipo: 'TODOS',
          precoMax: 90000,
          kmMax: 90000,
          distanciaMax: 250,
          scoreMin: 70,
          riscoMax: 'MEDIO',
          anoMin: 2018,
          margemMin: 2000,
          frequenciaMin: 30,
          scoreAlerta: 78,
        },
      },
    },
  })

  const listings = await Promise.all([
    prisma.listing.create({
      data: {
        userId: user.id,
        title: 'Honda XRE 300 ABS 2021',
        description: 'Moto revisada, unico dono, pneus novos.',
        price: 21900,
        type: 'MOTO',
        source: 'olx',
        sourceUrl: 'https://olx.com.br/demo-xre-300',
        imageUrls: [],
        brand: 'Honda',
        model: 'XRE 300',
        year: 2021,
        mileage: 38200,
        color: 'Vermelha',
        city: 'Campinas',
        state: 'SP',
        distanceKm: 38,
        opportunityScore: 87,
        riskScore: 22,
        riskLevel: 'LOW',
        aiSummary: 'Preco abaixo da media local, boa liquidez e historico coerente.',
        positiveSignals: ['Abaixo da FIPE', 'Baixa distancia', 'Boa revenda'],
        alertSignals: ['Confirmar historico de manutencao'],
        fipePrice: 24500,
        avgMarketPrice: 23600,
        estimatedMargin: 2600,
        status: 'ALERTED',
        alertSent: true,
        isFavorite: true,
        isDiscarded: false,
        createdAt: new Date(now - 1000 * 60 * 20),
      },
    }),
    prisma.listing.create({
      data: {
        userId: user.id,
        title: 'Toyota Corolla GLi 2020',
        description: 'Sedan completo, laudo cautelar aprovado, muito novo.',
        price: 88900,
        type: 'CARRO',
        source: 'webmotors',
        sourceUrl: 'https://webmotors.com.br/demo-corolla',
        imageUrls: [],
        brand: 'Toyota',
        model: 'Corolla',
        year: 2020,
        mileage: 45100,
        color: 'Prata',
        city: 'Jundiai',
        state: 'SP',
        distanceKm: 62,
        opportunityScore: 82,
        riskScore: 29,
        riskLevel: 'LOW',
        aiSummary: 'Mercado aquecido e margem positiva estimada acima da meta.',
        positiveSignals: ['Historico consistente', 'Mercado forte', 'Margem acima da meta'],
        alertSignals: ['Negociar revisao dos pneus'],
        fipePrice: 94200,
        avgMarketPrice: 91500,
        estimatedMargin: 3200,
        status: 'ANALYZED',
        alertSent: false,
        isFavorite: false,
        isDiscarded: false,
        createdAt: new Date(now - 1000 * 60 * 55),
      },
    }),
    prisma.listing.create({
      data: {
        userId: user.id,
        title: 'Honda CB 500F 2020',
        description: 'Moto urbana, documentacao em dia.',
        price: 28500,
        type: 'MOTO',
        source: 'facebook',
        sourceUrl: 'https://facebook.com/marketplace/demo-cb500f',
        imageUrls: [],
        brand: 'Honda',
        model: 'CB 500F',
        year: 2020,
        mileage: 27100,
        color: 'Preta',
        city: 'Sorocaba',
        state: 'SP',
        distanceKm: 96,
        opportunityScore: 79,
        riskScore: 41,
        riskLevel: 'MEDIUM',
        aiSummary: 'Boa oportunidade, mas precisa confirmar procedencia de manutencao.',
        positiveSignals: ['Preco competitivo', 'KM razoavel'],
        alertSignals: ['Poucas fotos', 'Verificar historico de quedas'],
        fipePrice: 30800,
        avgMarketPrice: 29600,
        estimatedMargin: 2100,
        status: 'ANALYZED',
        alertSent: false,
        isFavorite: true,
        isDiscarded: false,
        createdAt: new Date(now - 1000 * 60 * 90),
      },
    }),
    prisma.listing.create({
      data: {
        userId: user.id,
        title: 'Volkswagen Nivus Comfortline 2021',
        description: 'SUV muito procurado, todas revisoes na concessionaria.',
        price: 101900,
        type: 'CARRO',
        source: 'olx',
        sourceUrl: 'https://olx.com.br/demo-nivus',
        imageUrls: [],
        brand: 'Volkswagen',
        model: 'Nivus',
        year: 2021,
        mileage: 52000,
        color: 'Cinza',
        city: 'Sao Paulo',
        state: 'SP',
        distanceKm: 112,
        opportunityScore: 74,
        riskScore: 52,
        riskLevel: 'MEDIUM',
        aiSummary: 'Oportunidade mediana, acima do limite ideal de compra.',
        positiveSignals: ['Boa liquidez'],
        alertSignals: ['Preco alto', 'Margem apertada'],
        fipePrice: 104500,
        avgMarketPrice: 103200,
        estimatedMargin: 1200,
        status: 'ANALYZED',
        alertSent: false,
        isFavorite: false,
        isDiscarded: false,
        createdAt: new Date(now - 1000 * 60 * 140),
      },
    }),
  ])

  await prisma.alert.createMany({
    data: [
      {
        userId: user.id,
        listingId: listings[0].id,
        channel: 'telegram',
        message: 'XRE 300 entrou no radar com score 87 e margem estimada de R$ 2.600.',
        sent: false,
      },
      {
        userId: user.id,
        listingId: listings[1].id,
        channel: 'email',
        message: 'Corolla GLi 2020 identificado com score 82 e boa liquidez.',
        sent: false,
      },
    ],
  })

  await prisma.crmItem.createMany({
    data: [
      {
        userId: user.id,
        listingId: listings[0].id,
        title: listings[0].title,
        precoCompra: 21500,
        precoVenda: 24900,
        status: 'NEGOCIANDO',
        notes: 'Cliente aceitou discutir entrada a vista.',
        plate: 'ABC1D23',
        year: 2021,
        mileage: 38200,
        photos: [],
      },
      {
        userId: user.id,
        listingId: listings[1].id,
        title: listings[1].title,
        precoCompra: 87500,
        precoVenda: 92900,
        status: 'INTERESSE',
        notes: 'Aguardar retorno do vendedor sobre revisoes.',
        plate: 'FGH4J56',
        year: 2020,
        mileage: 45100,
        photos: [],
      },
    ],
  })

  await prisma.laudo.create({
    data: {
      userId: user.id,
      placa: 'ABC1D23',
      resultado: {
        situacao_geral: 'Regular',
        score_compra: 81,
        parecer: 'Historico consistente, sem bloqueios relevantes e com custo de regularizacao controlado.',
        origem: 'Seed demo interna',
        veiculo: {
          placa: 'ABC1D23',
          renavam: '12345678901',
          chassi: '9C2KD0810FR000123',
          marca: 'Honda',
          modelo: 'Biz 125',
          versao: 'EX',
          tipo: 'Moto',
          ano_fab: 2020,
          ano_mod: 2020,
          cor: 'Branco',
          combustivel: 'Gasolina',
          potencia: '9,2 cv',
          cilindradas: '124 cc',
          municipio: 'Campinas',
          uf: 'SP',
          num_proprietarios: 2,
          fipe_valor: 15900,
        },
        restricoes: {
          roubo_furto: { status: 'Negativo' },
          leilao: { status: 'Negativo' },
          sinistro: { status: 'Negativo' },
          gravame: { status: 'Negativo' },
          restricao_administrativa: { status: 'Negativo' },
          restricao_judicial: { status: 'Negativo' },
          comunicacao_venda: { status: 'Negativo' },
        },
        debitos: {
          ipva: { ano: 2020, situacao: 'Em dia', valor: 0 },
          licenciamento: { situacao: 'Em dia', valor: 0 },
          multas: { quantidade: 0, valor_total: 0 },
          dpvat: { situacao: 'Em dia' },
        },
        recall: {
          ativo: false,
        },
      },
      scoreCompra: 81,
      situacao: 'Regular',
      valorCobrado: 19,
    },
  })

  await prisma.pagamento.create({
    data: {
      userId: user.id,
      valor: 197,
      descricao: 'Plano Pro mensal',
      status: 'CONFIRMADO',
      tipo: 'ASSINATURA',
      asaasId: `demo-${Date.now()}`,
      asaasPaymentId: `pay-${Date.now()}`,
    },
  })

  console.log(JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, userId: user.id }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
