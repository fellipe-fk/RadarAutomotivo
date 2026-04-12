export type StatusConsulta = {
  status: 'Negativo' | 'Positivo'
}

export type LaudoResultado = {
  situacao_geral: 'Regular' | 'Atencao' | 'Reprovado'
  score_compra: number
  parecer: string
  origem: string
  veiculo: {
    placa: string
    renavam: string
    chassi: string
    marca: string
    modelo: string
    versao: string
    tipo: 'Moto' | 'Carro'
    ano_fab: number
    ano_mod: number
    cor: string
    combustivel: string
    potencia: string
    cilindradas: string
    municipio: string
    uf: string
    num_proprietarios: number
    fipe_valor: number
  }
  restricoes: {
    roubo_furto: StatusConsulta
    leilao: StatusConsulta
    sinistro: StatusConsulta
    gravame: StatusConsulta
    restricao_administrativa: StatusConsulta
    restricao_judicial: StatusConsulta
    comunicacao_venda: StatusConsulta
  }
  debitos: {
    ipva: {
      ano: number
      situacao: 'Em dia' | 'Pendente'
      valor: number
    }
    licenciamento: {
      situacao: 'Em dia' | 'Pendente'
      valor: number
    }
    multas: {
      quantidade: number
      valor_total: number
    }
    dpvat: {
      situacao: 'Em dia' | 'Pendente'
    }
  }
  recall: {
    ativo: boolean
    campanha?: string
    descricao?: string
  }
}

type CatalogItem = {
  marca: string
  modelo: string
  versao: string
  tipo: 'Moto' | 'Carro'
  combustivel: string
  potencia: string
  cilindradas: string
  fipeBase: number
}

const vehicleCatalog: CatalogItem[] = [
  {
    marca: 'Honda',
    modelo: 'XRE 300',
    versao: 'ABS',
    tipo: 'Moto',
    combustivel: 'Gasolina',
    potencia: '25 cv',
    cilindradas: '291 cc',
    fipeBase: 28600,
  },
  {
    marca: 'Yamaha',
    modelo: 'Fazer 250',
    versao: 'Connected',
    tipo: 'Moto',
    combustivel: 'Flex',
    potencia: '21 cv',
    cilindradas: '249 cc',
    fipeBase: 23800,
  },
  {
    marca: 'Toyota',
    modelo: 'Corolla',
    versao: 'GLi 2.0',
    tipo: 'Carro',
    combustivel: 'Flex',
    potencia: '177 cv',
    cilindradas: '1987 cc',
    fipeBase: 96800,
  },
  {
    marca: 'Honda',
    modelo: 'Civic',
    versao: 'EXL CVT',
    tipo: 'Carro',
    combustivel: 'Flex',
    potencia: '155 cv',
    cilindradas: '1997 cc',
    fipeBase: 104500,
  },
  {
    marca: 'Chevrolet',
    modelo: 'Onix',
    versao: 'LT Turbo',
    tipo: 'Carro',
    combustivel: 'Flex',
    potencia: '116 cv',
    cilindradas: '999 cc',
    fipeBase: 76800,
  },
  {
    marca: 'Volkswagen',
    modelo: 'Nivus',
    versao: 'Comfortline',
    tipo: 'Carro',
    combustivel: 'Flex',
    potencia: '128 cv',
    cilindradas: '999 cc',
    fipeBase: 118500,
  },
]

const cities = [
  { municipio: 'Sao Paulo', uf: 'SP' },
  { municipio: 'Campinas', uf: 'SP' },
  { municipio: 'Belo Horizonte', uf: 'MG' },
  { municipio: 'Curitiba', uf: 'PR' },
  { municipio: 'Goiania', uf: 'GO' },
  { municipio: 'Recife', uf: 'PE' },
]

const colors = ['Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho', 'Azul']
const recallCampaigns = [
  {
    campanha: 'Inspecao do modulo de freio',
    descricao: 'Atualizacao preventiva para evitar perda parcial de assistencia em frenagens longas.',
  },
  {
    campanha: 'Substituicao do chicote principal',
    descricao: 'Revisao do chicote por risco de falha intermitente em iluminacao e ignicao.',
  },
  {
    campanha: 'Reparo do airbag frontal',
    descricao: 'Campanha aberta para troca do conjunto de acionamento do airbag do motorista.',
  },
]

function hashString(value: string) {
  let hash = 0

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return hash || 1
}

function createGenerator(seed: number) {
  let state = seed >>> 0

  return (max: number, min = 0) => {
    state = (state * 1664525 + 1013904223) >>> 0
    const span = max - min + 1
    return min + (state % span)
  }
}

function buildStatus(isPositive: boolean): StatusConsulta {
  return { status: isPositive ? 'Positivo' : 'Negativo' }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildRenavam(next: (max: number, min?: number) => number) {
  let renavam = ''

  for (let index = 0; index < 11; index += 1) {
    renavam += String(next(9))
  }

  return renavam
}

function buildChassi(next: (max: number, min?: number) => number) {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  let chassi = ''

  for (let index = 0; index < 17; index += 1) {
    chassi += chars[next(chars.length - 1)]
  }

  return chassi
}

export function normalizarPlaca(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7)
}

export function gerarLaudo(placa: string, renavam?: string): LaudoResultado {
  const normalizedPlate = normalizarPlaca(placa)
  const seed = hashString(`${normalizedPlate}:${renavam || ''}`)
  const next = createGenerator(seed)

  const vehicle = vehicleCatalog[next(vehicleCatalog.length - 1)]
  const city = cities[next(cities.length - 1)]
  const anoMod = 2018 + next(7)
  const anoFab = Math.max(anoMod - next(1), 2017)
  const fipeValor = vehicle.fipeBase + next(9500, -4500)
  const generatedRenavam = renavam?.trim() || buildRenavam(next)

  const restricoes = {
    roubo_furto: buildStatus(next(99) < 4),
    leilao: buildStatus(next(99) < 8),
    sinistro: buildStatus(next(99) < 6),
    gravame: buildStatus(next(99) < 15),
    restricao_administrativa: buildStatus(next(99) < 11),
    restricao_judicial: buildStatus(next(99) < 5),
    comunicacao_venda: buildStatus(next(99) < 7),
  }

  const ipvaPendente = next(99) < 35
  const licenciamentoPendente = next(99) < 22
  const multasQuantidade = next(99) < 42 ? next(4, 1) : 0
  const dpvatPendente = next(99) < 8

  const debitos: LaudoResultado['debitos'] = {
    ipva: {
      ano: anoMod,
      situacao: ipvaPendente ? 'Pendente' : 'Em dia',
      valor: ipvaPendente ? next(3200, 600) : 0,
    },
    licenciamento: {
      situacao: licenciamentoPendente ? 'Pendente' : 'Em dia',
      valor: licenciamentoPendente ? next(360, 140) : 0,
    },
    multas: {
      quantidade: multasQuantidade,
      valor_total: multasQuantidade > 0 ? next(multasQuantidade * 520, multasQuantidade * 140) : 0,
    },
    dpvat: {
      situacao: dpvatPendente ? 'Pendente' : 'Em dia',
    },
  }

  const recallAtivo = next(99) < 14
  const recallBase = recallCampaigns[next(recallCampaigns.length - 1)]
  const recall: LaudoResultado['recall'] = recallAtivo
    ? {
        ativo: true,
        campanha: recallBase.campanha,
        descricao: recallBase.descricao,
      }
    : { ativo: false }

  const totalDebitos = debitos.ipva.valor + debitos.licenciamento.valor + debitos.multas.valor_total

  const hasSeriousRestriction =
    restricoes.roubo_furto.status === 'Positivo' ||
    restricoes.sinistro.status === 'Positivo' ||
    restricoes.restricao_judicial.status === 'Positivo'

  const hasModerateRestriction =
    restricoes.leilao.status === 'Positivo' ||
    restricoes.gravame.status === 'Positivo' ||
    restricoes.restricao_administrativa.status === 'Positivo' ||
    restricoes.comunicacao_venda.status === 'Positivo'

  let score = 88 + next(7)

  if (hasModerateRestriction) score -= 14
  if (hasSeriousRestriction) score -= 32
  if (totalDebitos > 0) score -= Math.min(20, Math.round(totalDebitos / 260))
  if (recall.ativo) score -= 6

  score = clamp(score, 28, 97)

  let situacao_geral: LaudoResultado['situacao_geral'] = 'Regular'

  if (hasSeriousRestriction || totalDebitos >= 2500) {
    situacao_geral = 'Reprovado'
  } else if (hasModerateRestriction || totalDebitos > 0 || recall.ativo) {
    situacao_geral = 'Atencao'
  }

  const alertas: string[] = []

  if (restricoes.roubo_furto.status === 'Positivo') alertas.push('registro de roubo/furto')
  if (restricoes.sinistro.status === 'Positivo') alertas.push('historico de sinistro')
  if (restricoes.leilao.status === 'Positivo') alertas.push('passagem por leilao')
  if (restricoes.gravame.status === 'Positivo') alertas.push('gravame ativo')
  if (totalDebitos > 0) alertas.push('debitos pendentes')
  if (recall.ativo) alertas.push('recall em aberto')

  const parecer =
    situacao_geral === 'Regular'
      ? 'Veiculo com perfil bom para compra e revenda. Nao foram encontrados impeditivos relevantes e os custos de regularizacao estao sob controle.'
      : situacao_geral === 'Atencao'
        ? `Veiculo negociavel, mas pede revisao documental e ajuste de margem. O sistema encontrou ${alertas.join(', ') || 'pontos que merecem conferencia'}.`
        : `Compra nao recomendada neste momento. O sistema identificou ${alertas.join(', ') || 'pendencias relevantes'} que podem travar a transferencia ou elevar muito o custo final.`

  return {
    situacao_geral,
    score_compra: score,
    parecer,
    origem: 'Triagem automatica interna',
    veiculo: {
      placa: normalizedPlate,
      renavam: generatedRenavam,
      chassi: buildChassi(next),
      marca: vehicle.marca,
      modelo: vehicle.modelo,
      versao: vehicle.versao,
      tipo: vehicle.tipo,
      ano_fab: anoFab,
      ano_mod: anoMod,
      cor: colors[next(colors.length - 1)],
      combustivel: vehicle.combustivel,
      potencia: vehicle.potencia,
      cilindradas: vehicle.cilindradas,
      municipio: city.municipio,
      uf: city.uf,
      num_proprietarios: next(3, 1),
      fipe_valor: fipeValor,
    },
    restricoes,
    debitos,
    recall,
  }
}
