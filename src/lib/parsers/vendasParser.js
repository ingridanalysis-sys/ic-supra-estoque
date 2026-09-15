// Parser do relatório "Movimento Sintético Vendas" (Sistema Net Use) — um
// arquivo por mês. Layout de linha:
//
//   <codigo> <codigo_barras> <descrição...> <unidade> <qtde_notas> <qtde_volumes> <tot_comissoes> <tot_vendas>
//
// Ao contrário do relatório de estoque, aqui código e código de barras vêm
// SEPARADOS por espaço — mais simples de separar. Reaproveitamos a mesma
// lista de unidades conhecidas do parser de estoque pra manter consistência.

import { UNIDADES_CONHECIDAS, separarCodigoEBarras } from './estoqueParser.js';

function parseNumeroBR(token) {
  if (token == null) return null;
  const limpo = token.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? null : n;
}

function pareceNumeroBR(token) {
  return /^-?\d{1,3}(\.\d{3})*,\d{2}$/.test(token) || /^-?\d+,\d{2}$/.test(token);
}

const LINHAS_IGNORAR = [
  /^IC SUPRA/i, /^IC L LOPES/i, /^R COELHO DE RESENDE/i, /^CNPJ/i, /^Fone/i,
  /^Movimento Sintético/i, /^Período:/i, /^={5,}/, /^_{5,}/, /^Emitido em/i,
  /^Pagina/i, /^Código Código Barras/i,
  /^Quant\. de Notas/i, /^Total de Produtos/i, /^Total Vendas/i, /^Media de Produtos/i,
  /^Total de Cliente/i,
];

function deveIgnorar(linha) {
  const l = linha.trim();
  if (!l) return true;
  return LINHAS_IGNORAR.some((re) => re.test(l));
}

function parseLinha(linhaOriginal) {
  const linha = linhaOriginal.trim();
  if (deveIgnorar(linha)) return null;

  const tokens = linha.split(/\s+/);
  if (tokens.length < 6) return null;

  const tail = tokens.slice(-4); // qtdeNotas, qtdeVolumes, totComissoes, totVendas
  if (!tail.every(pareceNumeroBR)) return null;

  const [qtdeNotasStr, qtdeVolumesStr, totComissoesStr, totVendasStr] = tail;
  const qtdeNotas = parseNumeroBR(qtdeNotasStr);
  const qtdeVolumes = parseNumeroBR(qtdeVolumesStr);
  const totComissoes = parseNumeroBR(totComissoesStr);
  const totVendas = parseNumeroBR(totVendasStr);

  const primeiroToken = tokens[0];
  const meio = tokens.slice(1, tokens.length - 4); // pode incluir a barras + descrição + unidade colada

  if (meio.length === 0) return null;

  let codigo = primeiroToken;
  let codigoBarras = null;
  let corpo = meio;

  // O segundo token normalmente é o código de barras (separado por espaço
  // aqui, diferente do relatório de estoque). Só tratamos como barras se
  // for puramente numérico — senão já é a primeira palavra da descrição.
  if (/^\d+$/.test(meio[0])) {
    codigoBarras = meio[0];
    corpo = meio.slice(1);
  } else {
    // fallback rara: código e barras vieram colados como no estoque
    const separado = separarCodigoEBarras(primeiroToken);
    codigo = separado.codigo;
    codigoBarras = separado.codigoBarras;
  }

  if (corpo.length === 0) return null;

  let unidade = '-';
  let descricaoTokens = corpo;
  const ultimaPalavra = corpo[corpo.length - 1];

  if (UNIDADES_CONHECIDAS.includes(ultimaPalavra)) {
    unidade = ultimaPalavra;
    descricaoTokens = corpo.slice(0, -1);
  } else {
    const sufixo = UNIDADES_CONHECIDAS.find(
      (u) => ultimaPalavra.endsWith(u) && ultimaPalavra.length > u.length
    );
    if (sufixo) {
      unidade = sufixo;
      descricaoTokens = [...corpo.slice(0, -1), ultimaPalavra.slice(0, -sufixo.length)];
    }
  }

  const descricao = descricaoTokens.join(' ').trim();
  if (!descricao) return null;

  return {
    codigo,
    codigoBarras,
    descricao,
    unidade,
    qtdeNotas,
    qtdeVolumes,
    totComissoes,
    totVendas,
  };
}

const MESES_NOME = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Extrai o período do cabeçalho ("Período: 01/06/2026 a 30/06/2026") e
 * devolve a chave do mês ("2026-06") e um rótulo amigável ("Junho/2026").
 */
function extrairPeriodo(textoCompleto) {
  const m = textoCompleto.match(/Período:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, , mesInicio, anoInicio, , , anoFim] = m;
  const mesNum = parseInt(mesInicio, 10);
  const ano = anoInicio || anoFim;
  const mesChave = `${ano}-${String(mesNum).padStart(2, '0')}`;
  const mesLabel = `${MESES_NOME[mesNum - 1]}/${ano}`;
  return { mesChave, mesLabel, periodoInicio: `${m[1]}/${m[2]}/${m[3]}`, periodoFim: `${m[4]}/${m[5]}/${m[6]}` };
}

/**
 * Faz o parse do texto completo de um relatório de vendas mensal.
 * Os totais do resumo são recalculados a partir das linhas — o rodapé
 * impresso do relatório vem com quebra de layout inconsistente, então não
 * confiamos nele além de conferência opcional.
 */
export function parseRelatorioVendas(textoCompleto) {
  const periodo = extrairPeriodo(textoCompleto);
  const linhas = textoCompleto.split('\n');
  const itens = [];

  for (const linha of linhas) {
    let item;
    try {
      item = parseLinha(linha);
    } catch {
      item = null;
    }
    if (item) itens.push(item);
  }

  const resumo = {
    produtosVendidos: itens.length,
    totalNotas: itens.reduce((s, i) => s + i.qtdeNotas, 0),
    totalVolumes: itens.reduce((s, i) => s + i.qtdeVolumes, 0),
    totalComissoes: itens.reduce((s, i) => s + i.totComissoes, 0),
    totalVendas: itens.reduce((s, i) => s + i.totVendas, 0),
  };

  return {
    ...(periodo ?? { mesChave: null, mesLabel: 'Período desconhecido', periodoInicio: null, periodoFim: null }),
    itens,
    resumo,
  };
}
