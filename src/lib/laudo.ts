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

export type LaudoProviderOverride = 'consultarplaca' | 'placasapp'

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

function hasValue(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function pickValue(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return undefined

  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null) return value
  }

  return undefined
}

function toStringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function toNumberValue(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const compact = value.replace(/[^\d,.-]/g, '')
    const normalized =
      compact.includes(',') && compact.includes('.')
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.includes(',')
          ? compact.replace(',', '.')
          : compact
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBooleanValue(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'sim', 'yes', 'ativo', 'aberto', 'pendente'].includes(normalized)) return true
    if (['false', '0', 'nao', 'não', 'no', 'inativo', 'fechado', 'regular'].includes(normalized)) return false
  }
  return fallback
}

function normalizeConsultaStatus(value: unknown, fallback: StatusConsulta): StatusConsulta {
  if (typeof value === 'boolean') {
    return { status: value ? 'Positivo' : 'Negativo' }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['positivo', 'pendente', 'ativo', 'sim', 'true', 'ok_com_alerta'].includes(normalized)) {
      return { status: 'Positivo' }
    }
    if (['negativo', 'regular', 'em dia', 'nao', 'não', 'false', 'ok'].includes(normalized)) {
      return { status: 'Negativo' }
    }
  }

  const record = asRecord(value)
  if (record) {
    const nestedStatus = pickValue(record, [
      'status',
      'situacao',
      'resultado',
      'value',
      'possui_restricao',
      'possui_comunicacao',
      'possui_infracoes',
      'possui_debito',
      'possui_debido',
      'possui_registro',
      'possui_recall',
      'ativo',
    ])
    return normalizeConsultaStatus(nestedStatus, fallback)
  }

  return fallback
}

function normalizeSituacaoGeral(value: unknown, fallback: LaudoResultado['situacao_geral']): LaudoResultado['situacao_geral'] {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['regular', 'ok', 'aprovado'].includes(normalized)) return 'Regular'
    if (['atencao', 'atenção', 'alerta', 'pendencia', 'pendência'].includes(normalized)) return 'Atencao'
    if (['reprovado', 'bloqueado', 'critico', 'crítico'].includes(normalized)) return 'Reprovado'
  }

  return fallback
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => asRecord(entry)).filter((entry): entry is Record<string, unknown> => !!entry)
    : []
}

function deepFindValue(value: unknown, keys: string[]): unknown {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = deepFindValue(entry, keys)
      if (found !== undefined) return found
    }
    return undefined
  }

  const record = asRecord(value)
  if (!record) return undefined

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key]
    }
  }

  for (const child of Object.values(record)) {
    const found = deepFindValue(child, keys)
    if (found !== undefined) return found
  }

  return undefined
}

function findSectionByKeys(sections: Record<string, unknown>[], keys: string[]) {
  for (const section of sections) {
    for (const key of keys) {
      const direct = section[key]
      if (direct !== undefined && direct !== null) {
        return asRecord(direct) || section
      }
    }
  }

  return null
}

function normalizeDebtSituation(value: unknown, fallback: 'Em dia' | 'Pendente') {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['pendente', 'sim', 'atrasado', 'aberto'].includes(normalized)) return 'Pendente'
    if (['em dia', 'nao', 'não', 'quitado', 'regular'].includes(normalized)) return 'Em dia'
  }

  if (typeof value === 'boolean') {
    return value ? 'Pendente' : 'Em dia'
  }

  return fallback
}

function buildLaudoAssessment(input: Pick<LaudoResultado, 'restricoes' | 'debitos' | 'recall'>, baseScore = 92) {
  const totalDebitos = input.debitos.ipva.valor + input.debitos.licenciamento.valor + input.debitos.multas.valor_total

  const hasSeriousRestriction =
    input.restricoes.roubo_furto.status === 'Positivo' ||
    input.restricoes.sinistro.status === 'Positivo' ||
    input.restricoes.restricao_judicial.status === 'Positivo'

  const hasModerateRestriction =
    input.restricoes.leilao.status === 'Positivo' ||
    input.restricoes.gravame.status === 'Positivo' ||
    input.restricoes.restricao_administrativa.status === 'Positivo' ||
    input.restricoes.comunicacao_venda.status === 'Positivo'

  let score = baseScore
  if (hasModerateRestriction) score -= 14
  if (hasSeriousRestriction) score -= 32
  if (totalDebitos > 0) score -= Math.min(20, Math.round(totalDebitos / 260))
  if (input.recall.ativo) score -= 6
  score = clamp(score, 28, 97)

  let situacao_geral: LaudoResultado['situacao_geral'] = 'Regular'
  if (hasSeriousRestriction || totalDebitos >= 2500) {
    situacao_geral = 'Reprovado'
  } else if (hasModerateRestriction || totalDebitos > 0 || input.recall.ativo) {
    situacao_geral = 'Atencao'
  }

  const alertas: string[] = []
  if (input.restricoes.roubo_furto.status === 'Positivo') alertas.push('registro de roubo/furto')
  if (input.restricoes.sinistro.status === 'Positivo') alertas.push('historico de sinistro')
  if (input.restricoes.leilao.status === 'Positivo') alertas.push('passagem por leilao')
  if (input.restricoes.gravame.status === 'Positivo') alertas.push('gravame ativo')
  if (totalDebitos > 0) alertas.push('debitos pendentes')
  if (input.recall.ativo) alertas.push('recall em aberto')

  const parecer =
    situacao_geral === 'Regular'
      ? 'Veiculo com perfil bom para compra e revenda. Nao foram encontrados impeditivos relevantes e os custos de regularizacao estao sob controle.'
      : situacao_geral === 'Atencao'
        ? `Veiculo negociavel, mas pede revisao documental e ajuste de margem. O sistema encontrou ${alertas.join(', ') || 'pontos que merecem conferencia'}.`
        : `Compra nao recomendada neste momento. O sistema identificou ${alertas.join(', ') || 'pendencias relevantes'} que podem travar a transferencia ou elevar muito o custo final.`

  return { score, situacao_geral, parecer }
}

function finalizeLaudoResultado(result: LaudoResultado, baseScore = 92): LaudoResultado {
  const assessment = buildLaudoAssessment(result, baseScore)
  return {
    ...result,
    score_compra: assessment.score,
    situacao_geral: assessment.situacao_geral,
    parecer: assessment.parecer,
  }
}

function mergeLaudoExterno(payload: unknown, fallback: LaudoResultado): LaudoResultado | null {
  const root = asRecord(payload)
  const candidate =
    asRecord(pickValue(root, ['resultado', 'laudo', 'data'])) ||
    root

  if (!candidate) return null

  const veiculo = asRecord(pickValue(candidate, ['veiculo', 'vehicle']))
  const restricoes = asRecord(pickValue(candidate, ['restricoes', 'restrictions']))
  const debitos = asRecord(pickValue(candidate, ['debitos', 'debts']))
  const ipva = asRecord(pickValue(debitos, ['ipva']))
  const licenciamento = asRecord(pickValue(debitos, ['licenciamento', 'licensing']))
  const multas = asRecord(pickValue(debitos, ['multas', 'fines']))
  const dpvat = asRecord(pickValue(debitos, ['dpvat']))
  const recall = asRecord(pickValue(candidate, ['recall']))

  const origemPadrao = process.env.VEHICLE_REPORT_PROVIDER_NAME?.trim() || 'Integracao externa configurada'
  const recallAtivo = toBooleanValue(pickValue(recall, ['ativo', 'active']), fallback.recall.ativo)
  const campanhaRecall = toStringValue(pickValue(recall, ['campanha', 'campaign']), fallback.recall.campanha || '')
  const descricaoRecall = toStringValue(pickValue(recall, ['descricao', 'description']), fallback.recall.descricao || '')

  return {
    situacao_geral: normalizeSituacaoGeral(
      pickValue(candidate, ['situacao_geral', 'situacao', 'status_geral', 'statusGeral']),
      fallback.situacao_geral
    ),
    score_compra: toNumberValue(pickValue(candidate, ['score_compra', 'scoreCompra', 'score']), fallback.score_compra),
    parecer: toStringValue(pickValue(candidate, ['parecer', 'resumo', 'observacao', 'observacao_final']), fallback.parecer),
    origem: toStringValue(pickValue(candidate, ['origem', 'provider', 'fonte']), origemPadrao),
    veiculo: {
      placa: normalizarPlaca(toStringValue(pickValue(veiculo, ['placa', 'plate']), fallback.veiculo.placa)),
      renavam: toStringValue(pickValue(veiculo, ['renavam']), fallback.veiculo.renavam),
      chassi: toStringValue(pickValue(veiculo, ['chassi', 'vin']), fallback.veiculo.chassi),
      marca: toStringValue(pickValue(veiculo, ['marca', 'brand']), fallback.veiculo.marca),
      modelo: toStringValue(pickValue(veiculo, ['modelo', 'model']), fallback.veiculo.modelo),
      versao: toStringValue(pickValue(veiculo, ['versao', 'version']), fallback.veiculo.versao),
      tipo: toStringValue(pickValue(veiculo, ['tipo', 'type']), fallback.veiculo.tipo) === 'Moto' ? 'Moto' : 'Carro',
      ano_fab: toNumberValue(pickValue(veiculo, ['ano_fab', 'anoFab', 'ano_fabricacao']), fallback.veiculo.ano_fab),
      ano_mod: toNumberValue(pickValue(veiculo, ['ano_mod', 'anoMod', 'ano_modelo']), fallback.veiculo.ano_mod),
      cor: toStringValue(pickValue(veiculo, ['cor', 'color']), fallback.veiculo.cor),
      combustivel: toStringValue(pickValue(veiculo, ['combustivel', 'fuel']), fallback.veiculo.combustivel),
      potencia: toStringValue(pickValue(veiculo, ['potencia', 'power']), fallback.veiculo.potencia),
      cilindradas: toStringValue(pickValue(veiculo, ['cilindradas', 'engine_size']), fallback.veiculo.cilindradas),
      municipio: toStringValue(pickValue(veiculo, ['municipio', 'cidade', 'city']), fallback.veiculo.municipio),
      uf: toStringValue(pickValue(veiculo, ['uf', 'state']), fallback.veiculo.uf),
      num_proprietarios: toNumberValue(
        pickValue(veiculo, ['num_proprietarios', 'numProprietarios', 'owners_count']),
        fallback.veiculo.num_proprietarios
      ),
      fipe_valor: toNumberValue(pickValue(veiculo, ['fipe_valor', 'fipeValor', 'fipe_price']), fallback.veiculo.fipe_valor),
    },
    restricoes: {
      roubo_furto: normalizeConsultaStatus(pickValue(restricoes, ['roubo_furto', 'rouboFurto', 'roubo']), fallback.restricoes.roubo_furto),
      leilao: normalizeConsultaStatus(pickValue(restricoes, ['leilao']), fallback.restricoes.leilao),
      sinistro: normalizeConsultaStatus(pickValue(restricoes, ['sinistro']), fallback.restricoes.sinistro),
      gravame: normalizeConsultaStatus(pickValue(restricoes, ['gravame']), fallback.restricoes.gravame),
      restricao_administrativa: normalizeConsultaStatus(
        pickValue(restricoes, ['restricao_administrativa', 'restricaoAdministrativa']),
        fallback.restricoes.restricao_administrativa
      ),
      restricao_judicial: normalizeConsultaStatus(
        pickValue(restricoes, ['restricao_judicial', 'restricaoJudicial']),
        fallback.restricoes.restricao_judicial
      ),
      comunicacao_venda: normalizeConsultaStatus(
        pickValue(restricoes, ['comunicacao_venda', 'comunicacaoVenda']),
        fallback.restricoes.comunicacao_venda
      ),
    },
    debitos: {
      ipva: {
        ano: toNumberValue(pickValue(ipva, ['ano', 'year']), fallback.debitos.ipva.ano),
        situacao:
          toStringValue(pickValue(ipva, ['situacao', 'status']), fallback.debitos.ipva.situacao) === 'Pendente'
            ? 'Pendente'
            : 'Em dia',
        valor: toNumberValue(pickValue(ipva, ['valor', 'amount']), fallback.debitos.ipva.valor),
      },
      licenciamento: {
        situacao:
          toStringValue(pickValue(licenciamento, ['situacao', 'status']), fallback.debitos.licenciamento.situacao) === 'Pendente'
            ? 'Pendente'
            : 'Em dia',
        valor: toNumberValue(pickValue(licenciamento, ['valor', 'amount']), fallback.debitos.licenciamento.valor),
      },
      multas: {
        quantidade: toNumberValue(pickValue(multas, ['quantidade', 'count']), fallback.debitos.multas.quantidade),
        valor_total: toNumberValue(pickValue(multas, ['valor_total', 'valorTotal', 'amount']), fallback.debitos.multas.valor_total),
      },
      dpvat: {
        situacao:
          toStringValue(pickValue(dpvat, ['situacao', 'status']), fallback.debitos.dpvat.situacao) === 'Pendente'
            ? 'Pendente'
            : 'Em dia',
      },
    },
    recall: recallAtivo
      ? {
          ativo: true,
          campanha: campanhaRecall || undefined,
          descricao: descricaoRecall || undefined,
        }
      : {
          ativo: false,
        },
  }
}

function parseConsultarPlacaResponse(payload: unknown, fallback: LaudoResultado, providerName: string) {
  const root = asRecord(payload)
  const sections = asRecordArray(pickValue(root, ['dados']))
  if (sections.length === 0) return null

  const infoSection = findSectionByKeys(sections, ['informacoes_veiculo'])
  const detranSection = findSectionByKeys(sections, ['informacoes_do_detran'])
  const precificadorSection = findSectionByKeys(sections, ['referencia_precificador'])
  const leilaoSection = findSectionByKeys(sections, ['registro_ofertas_leilao_prime', 'registro_ofertas_em_leiloes_prime', 'registro_ofertas_em_leiloes'])
  const sinistroSection = findSectionByKeys(sections, ['ocorrencia_sinistros_perda_total', 'ocorrencia_de_sinistros_perda_total', 'ocorrencia_sinistro_perda_total'])
  const rouboSection = findSectionByKeys(sections, ['historico_roubo_furto', 'roubo_furto'])
  const gravameSection = findSectionByKeys(sections, ['gravame', 'restricoes_financeiras_judiciais', 'restricao_financeira'])
  const recallSection = findSectionByKeys(sections, ['historico_recall', 'recall'])

  const dadosVeiculo = asRecord(deepFindValue(infoSection, ['dados_veiculo'])) || infoSection
  const dadosTecnicos = asRecord(deepFindValue(infoSection, ['dados_tecnicos'])) || infoSection
  const restricoesDetran = asRecord(deepFindValue(detranSection, ['restricoes_detran'])) || detranSection
  const debitosDetran = asRecord(deepFindValue(detranSection, ['debitos_detran'])) || detranSection
  const ipvaSection = asRecord(deepFindValue(debitosDetran, ['debitos_ipva']))
  const multaSection = asRecord(deepFindValue(debitosDetran, ['debitos_multa']))
  const licenciamentoSection = asRecord(deepFindValue(debitosDetran, ['debitos_licenciamento']))
  const dpvatSection = asRecord(deepFindValue(debitosDetran, ['debitos_dpvat']))
  const recallInfo = asRecord(deepFindValue(recallSection, ['informacoes_recall', 'recall']))
  const desvalorizacao = asRecordArray(deepFindValue(precificadorSection, ['desvalorizacao']))

  const transformed = {
    origem: providerName,
    veiculo: {
      placa: toStringValue(deepFindValue(dadosVeiculo, ['placa']), fallback.veiculo.placa),
      renavam: toStringValue(deepFindValue(detranSection, ['numero_renavam', 'renavam']), fallback.veiculo.renavam),
      chassi: toStringValue(deepFindValue(dadosVeiculo, ['chassi']), fallback.veiculo.chassi),
      marca: toStringValue(deepFindValue(dadosVeiculo, ['marca']), fallback.veiculo.marca),
      modelo: toStringValue(deepFindValue(dadosVeiculo, ['modelo']), fallback.veiculo.modelo),
      versao: toStringValue(deepFindValue(dadosTecnicos, ['versao', 'modelo_completo']), fallback.veiculo.versao),
      tipo: /moto|motocicleta/i.test(toStringValue(deepFindValue(dadosTecnicos, ['tipo_veiculo', 'tipo']), fallback.veiculo.tipo)) ? 'Moto' : 'Carro',
      ano_fab: toNumberValue(deepFindValue(dadosVeiculo, ['ano_fabricacao', 'ano_fab']), fallback.veiculo.ano_fab),
      ano_mod: toNumberValue(deepFindValue(dadosVeiculo, ['ano_modelo', 'ano_mod']), fallback.veiculo.ano_mod),
      cor: toStringValue(deepFindValue(dadosVeiculo, ['cor']), fallback.veiculo.cor),
      combustivel: toStringValue(deepFindValue(dadosVeiculo, ['combustivel']), fallback.veiculo.combustivel),
      potencia: toStringValue(deepFindValue(dadosTecnicos, ['potencia']), fallback.veiculo.potencia),
      cilindradas: toStringValue(deepFindValue(dadosTecnicos, ['cilindradas']), fallback.veiculo.cilindradas),
      municipio: toStringValue(deepFindValue(dadosVeiculo, ['municipio', 'cidade']), fallback.veiculo.municipio),
      uf: toStringValue(deepFindValue(dadosVeiculo, ['uf_municipio', 'uf']), fallback.veiculo.uf),
      num_proprietarios: toNumberValue(deepFindValue(detranSection, ['numero_proprietarios', 'num_proprietarios']), fallback.veiculo.num_proprietarios),
      fipe_valor: toNumberValue(
        deepFindValue(desvalorizacao[0], ['valor']) ?? deepFindValue(precificadorSection, ['valor_fipe', 'fipe_valor']),
        fallback.veiculo.fipe_valor
      ),
    },
    restricoes: {
      roubo_furto: normalizeConsultaStatus(
        deepFindValue(restricoesDetran, ['restricao_furto']) ?? rouboSection,
        fallback.restricoes.roubo_furto
      ),
      leilao: normalizeConsultaStatus(leilaoSection, fallback.restricoes.leilao),
      sinistro: normalizeConsultaStatus(sinistroSection, fallback.restricoes.sinistro),
      gravame: normalizeConsultaStatus(
        gravameSection ?? deepFindValue(restricoesDetran, ['restricao_judicial_renajud']),
        fallback.restricoes.gravame
      ),
      restricao_administrativa: normalizeConsultaStatus(
        deepFindValue(restricoesDetran, ['restricao_administrativa']),
        fallback.restricoes.restricao_administrativa
      ),
      restricao_judicial: normalizeConsultaStatus(
        deepFindValue(restricoesDetran, ['restricao_judicial', 'restricao_judicial_renajud']),
        fallback.restricoes.restricao_judicial
      ),
      comunicacao_venda: normalizeConsultaStatus(
        deepFindValue(restricoesDetran, ['comunicacao_venda']),
        fallback.restricoes.comunicacao_venda
      ),
    },
    debitos: {
      ipva: {
        ano: toNumberValue(deepFindValue(dadosVeiculo, ['ano_modelo', 'ano_mod']), fallback.debitos.ipva.ano),
        situacao: normalizeDebtSituation(
          deepFindValue(ipvaSection, ['situacao']) ?? deepFindValue(ipvaSection, ['possui_debido', 'possui_debito']),
          fallback.debitos.ipva.situacao
        ),
        valor: toNumberValue(deepFindValue(ipvaSection, ['debido', 'valor']), fallback.debitos.ipva.valor),
      },
      licenciamento: {
        situacao: normalizeDebtSituation(
          deepFindValue(licenciamentoSection, ['situacao']) ?? deepFindValue(licenciamentoSection, ['possui_debido', 'possui_debito']),
          fallback.debitos.licenciamento.situacao
        ),
        valor: toNumberValue(deepFindValue(licenciamentoSection, ['debido', 'valor']), fallback.debitos.licenciamento.valor),
      },
      multas: {
        quantidade: toNumberValue(deepFindValue(multaSection, ['quantidade', 'qtd']), fallback.debitos.multas.quantidade),
        valor_total: toNumberValue(deepFindValue(multaSection, ['debido', 'valor_total', 'valor']), fallback.debitos.multas.valor_total),
      },
      dpvat: {
        situacao: normalizeDebtSituation(
          deepFindValue(dpvatSection, ['situacao']) ?? deepFindValue(dpvatSection, ['possui_debido', 'possui_debito']),
          fallback.debitos.dpvat.situacao
        ),
      },
    },
    recall: {
      ativo: toBooleanValue(deepFindValue(recallInfo, ['possui_recall', 'ativo', 'possui_registro']), fallback.recall.ativo),
      campanha: toStringValue(deepFindValue(recallInfo, ['campanha', 'nome']), fallback.recall.campanha || ''),
      descricao: toStringValue(deepFindValue(recallInfo, ['descricao', 'observacao']), fallback.recall.descricao || ''),
    },
  }

  const merged = mergeLaudoExterno(transformed, fallback)
  return merged ? finalizeLaudoResultado(merged) : null
}

function normalizePlacasAppBrand(value: string) {
  const normalized = value.trim().toUpperCase()

  if (normalized === 'VW') return 'Volkswagen'
  if (normalized === 'GM') return 'Chevrolet'
  if (normalized === 'MB') return 'Mercedes-Benz'
  if (normalized === 'HONDA') return 'Honda'
  if (normalized === 'YAMAHA') return 'Yamaha'
  if (normalized === 'TOYOTA') return 'Toyota'
  if (normalized === 'VOLKSWAGEN') return 'Volkswagen'
  if (normalized === 'FIAT') return 'Fiat'
  if (normalized === 'FORD') return 'Ford'
  if (normalized === 'RENAULT') return 'Renault'
  if (normalized === 'HYUNDAI') return 'Hyundai'

  return value.trim()
}

function formatVehicleMetric(value: unknown, suffix: string, fallback: string) {
  if (typeof value === 'string' && value.trim()) {
    return /\D/.test(value) ? value.trim() : `${value.trim()} ${suffix}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value} ${suffix}`
  }

  return fallback
}

function sanitizePlacasAppModel(value: string, brand: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return trimmed
  }

  const compactBrand = brand.trim().toUpperCase()
  const normalized = trimmed.replace(/\s+/g, ' ').trim()
  const upper = normalized.toUpperCase()

  if (compactBrand && upper.startsWith(`${compactBrand}/`)) {
    return normalized.slice(compactBrand.length + 1).trim()
  }

  if (compactBrand && upper.startsWith(`${compactBrand} `)) {
    return normalized.slice(compactBrand.length).trim()
  }

  return normalized
}

function derivePlacasAppVersion(model: string, group: string, fallback: string) {
  const normalizedModel = model.trim()
  const normalizedGroup = group.trim()

  if (normalizedModel && normalizedGroup) {
    const upperModel = normalizedModel.toUpperCase()
    const upperGroup = normalizedGroup.toUpperCase()

    if (upperModel === upperGroup) {
      return fallback
    }

    if (upperModel.startsWith(`${upperGroup} `)) {
      const derived = normalizedModel.slice(normalizedGroup.length).trim()
      if (derived) return derived
    }
  }

  return normalizedGroup || fallback
}

type PlacasAppFipeLookup = {
  codigo: string
  modelo: string
  ano: number | null
  valor: number
}

function normalizePlacasAppFipeYear(value: unknown) {
  const parsed = toNumberValue(value, NaN)
  if (!Number.isFinite(parsed)) return null
  if (parsed >= 1900 && parsed <= 2100) return parsed
  return null
}

function selectPlacasAppFipeLookup(entries: Record<string, unknown>[], targetYears: number[]) {
  const normalizedEntries = entries
    .map((entry) => {
      const valor = toNumberValue(entry.preco, NaN)
      if (!Number.isFinite(valor)) {
        return null
      }

      return {
        codigo: toStringValue(pickValue(entry, ['codigo_fipe']), ''),
        modelo: toStringValue(pickValue(entry, ['modelo']), ''),
        ano: normalizePlacasAppFipeYear(pickValue(entry, ['ano'])),
        valor,
      } satisfies PlacasAppFipeLookup
    })
    .filter((entry): entry is PlacasAppFipeLookup => !!entry)

  for (const targetYear of targetYears) {
    const exactMatch = normalizedEntries.find((entry) => entry.ano === targetYear)
    if (exactMatch) {
      return exactMatch
    }
  }

  return normalizedEntries.find((entry) => entry.ano !== null) || normalizedEntries[0] || null
}

async function fetchPlacasAppFipeLookup(
  baseUrl: string,
  token: string,
  payload: unknown,
  timeoutMs: number
) {
  const root = asRecord(payload)
  if (!root) return null

  const brand = normalizePlacasAppBrand(toStringValue(pickValue(root, ['marca']), ''))
  const model = sanitizePlacasAppModel(toStringValue(pickValue(root, ['modelo', 'grupo']), ''), brand)

  if (!model) {
    return null
  }

  const targetYears = [
    normalizePlacasAppFipeYear(pickValue(root, ['ano_modelo'])),
    normalizePlacasAppFipeYear(pickValue(root, ['ano_fabricacao'])),
  ].filter((year): year is number => year !== null)

  const endpoint = brand ? 'marca-modelo' : 'modelo'
  const requestBody = brand ? { marca: brand.toUpperCase(), modelo: model } : { modelo: model }

  const response = await fetch(`${baseUrl}/fipe/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    return null
  }

  const responsePayload = await response.json()
  const entries = Array.isArray(responsePayload)
    ? responsePayload
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => !!entry)
    : []

  if (!entries.length) {
    return null
  }

  return selectPlacasAppFipeLookup(entries, targetYears)
}

function parsePlacasAppResponse(
  payload: unknown,
  fallback: LaudoResultado,
  providerName: string,
  fipeLookup?: PlacasAppFipeLookup | null
) {
  const root = asRecord(payload)
  if (!root) return null

  const vehicleTypeSource = toStringValue(
    pickValue(root, ['tipo_veiculo', 'segmento', 'sub_segmento', 'especie']),
    fallback.veiculo.tipo
  )
  const brand = normalizePlacasAppBrand(toStringValue(pickValue(root, ['marca']), fallback.veiculo.marca))
  const model = sanitizePlacasAppModel(toStringValue(pickValue(root, ['modelo']), fallback.veiculo.modelo), brand)
  const group = toStringValue(pickValue(root, ['grupo']), fallback.veiculo.versao)
  const version = derivePlacasAppVersion(model, group, fallback.veiculo.versao)

  const transformed = {
    origem: `${providerName} + triagem interna`,
    veiculo: {
      placa: normalizarPlaca(
        toStringValue(
          pickValue(root, ['placa_modelo_novo', 'placa_modelo_antigo', 'placa']),
          fallback.veiculo.placa
        )
      ),
      renavam: fallback.veiculo.renavam,
      chassi: toStringValue(pickValue(root, ['chassi']), fallback.veiculo.chassi),
      marca: brand,
      modelo: model || fallback.veiculo.modelo,
      versao: version,
      tipo: /moto|motocicleta/i.test(vehicleTypeSource) ? 'Moto' : 'Carro',
      ano_fab: toNumberValue(pickValue(root, ['ano_fabricacao']), fallback.veiculo.ano_fab),
      ano_mod: toNumberValue(pickValue(root, ['ano_modelo']), fallback.veiculo.ano_mod),
      cor: toStringValue(pickValue(root, ['cor']), fallback.veiculo.cor),
      combustivel: toStringValue(pickValue(root, ['combustivel']), fallback.veiculo.combustivel),
      potencia: formatVehicleMetric(pickValue(root, ['potencia']), 'cv', fallback.veiculo.potencia),
      cilindradas: formatVehicleMetric(pickValue(root, ['cilindradas']), 'cc', fallback.veiculo.cilindradas),
      municipio: toStringValue(pickValue(root, ['municipio']), fallback.veiculo.municipio),
      uf: toStringValue(pickValue(root, ['uf', 'uf_placa']), fallback.veiculo.uf),
      num_proprietarios: fallback.veiculo.num_proprietarios,
      fipe_valor: fipeLookup?.valor ?? fallback.veiculo.fipe_valor,
    },
    restricoes: fallback.restricoes,
    debitos: fallback.debitos,
    recall: fallback.recall,
  }

  const merged = mergeLaudoExterno(transformed, fallback)
  return merged ? finalizeLaudoResultado(merged) : null
}

function isConsultarPlacaProvider(providerCode: string, providerName: string) {
  return providerCode.includes('consultarplaca') || providerName.toLowerCase().includes('consultarplaca')
}

function isPlacasAppProvider(providerCode: string, providerName: string) {
  const normalizedName = providerName.toLowerCase()
  return (
    providerCode.includes('placasapp') ||
    providerCode.includes('placas.app') ||
    normalizedName.includes('placas.app') ||
    normalizedName.includes('placas app')
  )
}

export function getLaudoProviderStatus(providerOverride?: LaudoProviderOverride) {
  const apiUrl = process.env.VEHICLE_REPORT_API_URL?.trim()
  const configuredProviderName = process.env.VEHICLE_REPORT_PROVIDER_NAME?.trim() || 'Integracao externa'
  const configuredProviderCode = process.env.VEHICLE_REPORT_PROVIDER?.trim().toLowerCase() || configuredProviderName.toLowerCase()
  const providerCode = providerOverride || configuredProviderCode
  const providerName =
    providerOverride === 'consultarplaca'
      ? 'ConsultarPlaca'
      : providerOverride === 'placasapp'
        ? 'placas.app.br'
        : configuredProviderName
  const basicUser = process.env.VEHICLE_REPORT_BASIC_USER?.trim() || process.env.VEHICLE_REPORT_API_EMAIL?.trim()
  const apiKey = process.env.VEHICLE_REPORT_API_KEY?.trim()
  const placasAppBaseUrl = process.env.VEHICLE_REPORT_PLACAS_APP_BASE_URL?.trim() || 'https://placas.app.br/api/v1'
  const placasAppEmail = process.env.VEHICLE_REPORT_PLACAS_APP_EMAIL?.trim()
  const placasAppPassword = process.env.VEHICLE_REPORT_PLACAS_APP_PASSWORD?.trim()
  const credentialsConfigured = isConsultarPlacaProvider(providerCode, providerName)
    ? hasValue(apiUrl) && hasValue(basicUser) && hasValue(apiKey)
    : isPlacasAppProvider(providerCode, providerName)
      ? hasValue(placasAppBaseUrl) && hasValue(placasAppEmail) && hasValue(placasAppPassword)
      : hasValue(apiUrl)

  return {
    configured: credentialsConfigured,
    providerName,
    providerCode,
    strictMode: process.env.VEHICLE_REPORT_REQUIRED === 'true',
  }
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

  const assessment = buildLaudoAssessment(
    { restricoes, debitos, recall },
    88 + next(7)
  )

  return {
    situacao_geral: assessment.situacao_geral,
    score_compra: assessment.score,
    parecer: assessment.parecer,
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

function createBasicAuthHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readProviderError(response: Response, fallbackMessage: string) {
  const text = await response.text()

  if (!text.trim()) {
    return fallbackMessage
  }

  try {
    const payload = JSON.parse(text)
    const record = asRecord(payload)
    const message = toStringValue(
      pickValue(record, ['mensagem', 'message', 'erro', 'error', 'detail', 'tipo_do_erro']),
      ''
    )

    if (message) {
      return `${fallbackMessage}: ${message}`
    }
  } catch {
    // keep the plain-text fallback below
  }

  const compactText = text.replace(/\s+/g, ' ').trim().slice(0, 240)
  return compactText ? `${fallbackMessage}: ${compactText}` : fallbackMessage
}

function buildProviderFallbackResult(
  fallback: LaudoResultado,
  providerName: string,
  reason: string
): LaudoResultado {
  return {
    ...fallback,
    origem: `${providerName} indisponivel - fallback interno`,
    parecer: `${fallback.parecer} Motivo da contingencia: ${reason}. O sistema gerou uma triagem automatica interna como contingencia.`,
  }
}

async function consultarLaudoConsultarPlaca(
  plate: string,
  renavam: string | undefined,
  fallback: LaudoResultado,
  providerName: string,
  strictMode: boolean
) {
  const username = process.env.VEHICLE_REPORT_BASIC_USER?.trim() || process.env.VEHICLE_REPORT_API_EMAIL?.trim()
  const apiKey = process.env.VEHICLE_REPORT_API_KEY?.trim()

  if (!hasValue(username) || !hasValue(apiKey)) {
    throw new Error(`${providerName} precisa de VEHICLE_REPORT_BASIC_USER e VEHICLE_REPORT_API_KEY`)
  }

  const authHeader = createBasicAuthHeader(username!, apiKey!)
  const submitUrl = process.env.VEHICLE_REPORT_API_URL?.trim() || 'https://api.consultarplaca.com.br/v2/solicitarRelatorio'
  const consultUrl = process.env.VEHICLE_REPORT_CONSULTAR_PLACA_STATUS_URL?.trim() || 'https://api.consultarplaca.com.br/v2/consultarProtocolo'
  const timeoutMs = toNumberValue(process.env.VEHICLE_REPORT_TIMEOUT_MS, 15000)
  const pollAttempts = toNumberValue(process.env.VEHICLE_REPORT_POLL_ATTEMPTS, 8)
  const pollIntervalMs = toNumberValue(process.env.VEHICLE_REPORT_POLL_INTERVAL_MS, 1500)
  const reportType = process.env.VEHICLE_REPORT_CONSULTAR_PLACA_TIPO?.trim() || 'prata'
  const extraInfo = process.env.VEHICLE_REPORT_CONSULTAR_PLACA_INFO?.trim()
  const revenda = process.env.VEHICLE_REPORT_CONSULTAR_PLACA_REVENDA === 'true' ? '1' : '0'

  const form = new FormData()
  form.append('placa', plate)
  form.append('tipo_consulta', reportType)
  form.append('consulta_para_revenda', revenda)
  if (extraInfo) form.append('informacoes_adicionais', extraInfo)
  if (renavam) form.append('renavam', renavam)

  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
    },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!submitResponse.ok) {
    throw new Error(
      await readProviderError(
        submitResponse,
        `${providerName} retornou ${submitResponse.status} ao solicitar o relatorio`
      )
    )
  }

  const submitPayload = (await submitResponse.json()) as Record<string, unknown>
  const protocolo = toStringValue(submitPayload.protocolo, '')

  if (!protocolo) {
    throw new Error(`${providerName} nao retornou protocolo para consulta`)
  }

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const statusUrl = new URL(consultUrl)
    statusUrl.searchParams.set('protocolo', protocolo)
    statusUrl.searchParams.set('tipo_retorno', 'JSON')

    const consultResponse = await fetch(statusUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!consultResponse.ok) {
      throw new Error(
        await readProviderError(
          consultResponse,
          `${providerName} retornou ${consultResponse.status} ao consultar o protocolo`
        )
      )
    }

    const consultPayload = await consultResponse.json()
    const situacao = toStringValue(asRecord(consultPayload)?.situacao_consulta, '')

    if (situacao === 'finalizada' || situacao === 'parcialmente_finalizada') {
      const parsed = parseConsultarPlacaResponse(consultPayload, fallback, providerName)
      if (parsed) return parsed
    }

    if (attempt < pollAttempts - 1) {
      await sleep(pollIntervalMs)
    }
  }

  if (strictMode) {
    throw new Error(`${providerName} ainda esta processando a consulta e nao retornou JSON final no tempo esperado`)
  }

  return {
    ...fallback,
    origem: `${providerName} em processamento - fallback interno`,
    parecer: `${fallback.parecer} A consulta externa foi iniciada, mas ainda nao finalizou a tempo. O sistema exibiu uma triagem automatica interna como contingencia.`,
  }
}

async function consultarLaudoPlacasApp(
  plate: string,
  fallback: LaudoResultado,
  providerName: string,
  strictMode: boolean
) {
  const baseUrl = process.env.VEHICLE_REPORT_PLACAS_APP_BASE_URL?.trim() || 'https://placas.app.br/api/v1'
  const email = process.env.VEHICLE_REPORT_PLACAS_APP_EMAIL?.trim()
  const password = process.env.VEHICLE_REPORT_PLACAS_APP_PASSWORD?.trim()
  const timeoutMs = toNumberValue(process.env.VEHICLE_REPORT_TIMEOUT_MS, 15000)

  if (!hasValue(email) || !hasValue(password)) {
    throw new Error(`${providerName} precisa de VEHICLE_REPORT_PLACAS_APP_EMAIL e VEHICLE_REPORT_PLACAS_APP_PASSWORD`)
  }

  const authResponse = await fetch(`${baseUrl}/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!authResponse.ok) {
    throw new Error(await readProviderError(authResponse, `${providerName} retornou ${authResponse.status} ao autenticar`))
  }

  const authPayload = (await authResponse.json()) as Record<string, unknown>
  const token = toStringValue(
    pickValue(authPayload, ['token', 'access_token', 'accessToken']),
    ''
  )

  if (!token) {
    throw new Error(`${providerName} nao retornou token de autenticacao`)
  }

  const plateResponse = await fetch(`${baseUrl}/placas/numero`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ placa: plate }),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!plateResponse.ok) {
    throw new Error(
      await readProviderError(
        plateResponse,
        `${providerName} retornou ${plateResponse.status} ao consultar a placa`
      )
    )
  }

  const platePayload = await plateResponse.json()
  const errorMessage = toStringValue(asRecord(platePayload)?.erro, '')

  if (errorMessage) {
    throw new Error(`${providerName}: ${errorMessage}`)
  }

  let fipeLookup: PlacasAppFipeLookup | null = null

  try {
    fipeLookup = await fetchPlacasAppFipeLookup(baseUrl, token, platePayload, timeoutMs)
  } catch {
    fipeLookup = null
  }

  const parsed = parsePlacasAppResponse(platePayload, fallback, providerName, fipeLookup)

  if (parsed) {
    return parsed
  }

  if (strictMode) {
    throw new Error(`${providerName} nao retornou um payload valido para a placa informada`)
  }

  return {
    ...fallback,
    origem: `${providerName} sem dados completos - fallback interno`,
    parecer: `${fallback.parecer} O provedor externo identificou a placa, mas nao retornou estrutura suficiente para montar um laudo completo. O sistema exibiu a triagem automatica interna como contingencia.`,
  }
}

export async function consultarLaudoVeicular(
  placa: string,
  renavam?: string,
  options?: { providerOverride?: LaudoProviderOverride }
): Promise<LaudoResultado> {
  const normalizedPlate = normalizarPlaca(placa)
  const fallback = gerarLaudo(normalizedPlate, renavam)
  const { configured, providerName, providerCode, strictMode } = getLaudoProviderStatus(options?.providerOverride)

  if (!configured) {
    return fallback
  }

  if (isConsultarPlacaProvider(providerCode, providerName)) {
    try {
      return await consultarLaudoConsultarPlaca(normalizedPlate, renavam, fallback, providerName, strictMode)
    } catch (error) {
      if (strictMode) {
        throw new Error(error instanceof Error ? error.message : `Falha ao consultar ${providerName}`)
      }

      return buildProviderFallbackResult(
        fallback,
        providerName,
        error instanceof Error ? error.message : `Falha ao consultar ${providerName}`
      )
    }
  }

  if (isPlacasAppProvider(providerCode, providerName)) {
    try {
      return await consultarLaudoPlacasApp(normalizedPlate, fallback, providerName, strictMode)
    } catch (error) {
      if (strictMode) {
        throw new Error(error instanceof Error ? error.message : `Falha ao consultar ${providerName}`)
      }

      return buildProviderFallbackResult(
        fallback,
        providerName,
        error instanceof Error ? error.message : `Falha ao consultar ${providerName}`
      )
    }
  }

  const apiUrl = process.env.VEHICLE_REPORT_API_URL!.trim()
  const apiKey = process.env.VEHICLE_REPORT_API_KEY?.trim()
  const authHeader = process.env.VEHICLE_REPORT_AUTH_HEADER?.trim() || 'Authorization'
  const authPrefix = process.env.VEHICLE_REPORT_AUTH_PREFIX?.trim() || 'Bearer'
  const timeoutMs = toNumberValue(process.env.VEHICLE_REPORT_TIMEOUT_MS, 15000)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers[authHeader] = authPrefix ? `${authPrefix} ${apiKey}` : apiKey
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        plate: normalizedPlate,
        placa: normalizedPlate,
        renavam: renavam?.trim() || undefined,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      throw new Error(await readProviderError(response, `${providerName} retornou ${response.status}`))
    }

    const payload = await response.json()
    const merged = mergeLaudoExterno(payload, fallback)

    if (!merged) {
      throw new Error(`${providerName} nao retornou um payload valido`)
    }

    return finalizeLaudoResultado(merged)
  } catch (error) {
    if (strictMode) {
      throw new Error(error instanceof Error ? error.message : `Falha ao consultar ${providerName}`)
    }

    return buildProviderFallbackResult(
      fallback,
      providerName,
      error instanceof Error ? error.message : `Falha ao consultar ${providerName}`
    )
  }
}
