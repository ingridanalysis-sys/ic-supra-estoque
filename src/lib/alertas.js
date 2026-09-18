// Todo o cálculo de alerta é feito aqui, de forma pura e determinística.
// A IA (ver netlify/functions/analise-estoque.js) nunca calcula nada — ela
// só recebe esta lista já pronta e escreve a interpretação em texto.
//
// IMPORTANTE SOBRE PERFORMANCE: com um catálogo de ~10 mil produtos, ler o
// localStorage (config + pedidos) item por item trava a tela. Por isso
// classificarItem() recebe `config` e `pendente` já resolvidos — quem
// monta o painel (gerarPainelAlertas) lê tudo UMA vez só, no início.

import { getConfigProduto, getTodasConfigs } from './configProdutos';
import { getPedidosPendentesPorCodigo, getPedidosPendentesMapa } from './historicoPedidos';
import { getResumoVendasPorProduto } from './historicoVendas';
import { inferirSetor, SETORES_FLAG_GESTAO } from './setores';
import { listarVinculos, listarFornecedores } from './fornecedores';

/**
 * Classifica um item do estoque em um nível de alerta.
 *
 * `config` e `pendente` são opcionais: se não vierem (uso avulso, fora do
 * painel em lote), a função busca sozinha — mas isso é lento em escala,
 * então gerarPainelAlertas() sempre os passa prontos.
 *
 * Regras (nesta ordem de prioridade):
 *  1. NEGATIVO   — quantidade < 0 (erro de contagem/lançamento, corrigir estoque)
 *  2. RUPTURA    — quantidade === 0 e o produto está marcado como "ativo"
 *  3. CRITICO    — dias de cobertura (se houver giro cadastrado) menores que o
 *                  lead time do fornecedor + margem de segurança
 *  4. ATENCAO    — estoque abaixo do mínimo cadastrado
 *  5. MONITORAR  — dentro da faixa aceitável mas próximo do mínimo (<50% de folga)
 *  6. OK         — estoque confortável
 *
 * `temVendaRegistrada` (opcional, resolvido sozinho se não vier) indica se o
 * código apareceu em algum mês importado do Mix de Vendas. Zerado no estoque
 * significa "precisa comprar", nunca "descontinuar" — por isso um produto
 * com venda registrada NUNCA é tratado como descontinuado aqui, mesmo que a
 * flag `cfg.descontinuado` já esteja salva (ex: de uma marcação em lote por
 * setor anterior a essa regra existir).
 */
export function classificarItem(item, config = undefined, pendente = undefined, temVendaRegistrada = undefined) {
  const cfg = config !== undefined ? config : getConfigProduto(item.codigo);
  const pendenteResolvido = pendente !== undefined ? pendente : getPedidosPendentesPorCodigo(item.codigo);
  const saldoConsiderandoPedidos = item.quantidade + pendenteResolvido;

  const giroSemanal = cfg?.giroSemanal ?? null;
  const leadTimeDias = cfg?.leadTimeDias ?? 7; // padrão conservador se não cadastrado
  const margemSegurancaDias = cfg?.margemSegurancaDias ?? 3;
  const estoqueMinimo = cfg?.estoqueMinimo ?? null;

  // Ponto de pedido: quantidade em estoque na qual já se deveria ter
  // comprado, pra não ficar sem durante o lead time do fornecedor + margem
  // de segurança — é a mesma regra do alerta CRITICO (ver abaixo), só que
  // expressa em unidades em vez de dias, pra poder ser exibida como número.
  const pontoPedido = giroSemanal && giroSemanal > 0
    ? (giroSemanal / 7) * (leadTimeDias + margemSegurancaDias)
    : null;

  if (item.quantidade < 0) {
    return {
      nivel: 'NEGATIVO',
      motivo: 'Divergência de contagem — confira antes de repor.',
      diasCobertura: null,
      saldoConsiderandoPedidos,
      pontoPedido,
    };
  }

  const vendeu = temVendaRegistrada !== undefined
    ? temVendaRegistrada
    : Object.prototype.hasOwnProperty.call(getResumoVendasPorProduto(), item.codigo);

  if (cfg?.descontinuado && !vendeu) {
    return { nivel: 'OK', motivo: 'Produto marcado como descontinuado — ignorado nos alertas.', diasCobertura: null, saldoConsiderandoPedidos, pontoPedido };
  }

  let diasCobertura = null;
  if (giroSemanal && giroSemanal > 0) {
    diasCobertura = (saldoConsiderandoPedidos / giroSemanal) * 7;
  }

  if (item.quantidade === 0) {
    return {
      nivel: 'RUPTURA',
      motivo: pendenteResolvido > 0
        ? `Estoque zerado, mas há ${pendenteResolvido} unidade(s) já em pedido pendente.`
        : 'Estoque zerado e sem pedido pendente registrado.',
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
    };
  }

  if (diasCobertura !== null && diasCobertura <= leadTimeDias + margemSegurancaDias) {
    return {
      nivel: 'CRITICO',
      motivo: `Cobertura de ${diasCobertura.toFixed(1)} dia(s) — menor que o lead time do fornecedor (${leadTimeDias}d) + margem de segurança (${margemSegurancaDias}d).`,
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
    };
  }

  if (estoqueMinimo !== null && saldoConsiderandoPedidos < estoqueMinimo) {
    return {
      nivel: 'ATENCAO',
      motivo: `Estoque (${saldoConsiderandoPedidos}) abaixo do mínimo cadastrado (${estoqueMinimo}).`,
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
    };
  }

  if (estoqueMinimo !== null && saldoConsiderandoPedidos < estoqueMinimo * 1.5) {
    return {
      nivel: 'MONITORAR',
      motivo: 'Estoque com folga reduzida em relação ao mínimo cadastrado.',
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
    };
  }

  if (diasCobertura !== null && diasCobertura <= (leadTimeDias + margemSegurancaDias) * 2) {
    return {
      nivel: 'MONITORAR',
      motivo: `Cobertura de ${diasCobertura.toFixed(1)} dia(s) — folga reduzida.`,
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
    };
  }

  return { nivel: 'OK', motivo: 'Estoque em nível confortável.', diasCobertura, saldoConsiderandoPedidos, pontoPedido };
}

/**
 * Aplica a classificação a uma lista de itens do snapshot e devolve
 * a lista ordenada por prioridade (mais crítico primeiro), já com o
 * setor de cada item resolvido (config manual > inferência por descrição).
 *
 * Lê config e pedidos pendentes UMA vez só (não por item) — é o que faz
 * essa função funcionar em menos de 1s mesmo com o catálogo inteiro.
 */
const ORDEM_NIVEL = { NEGATIVO: 0, RUPTURA: 1, CRITICO: 2, ATENCAO: 3, MONITORAR: 4, OK: 5 };

/**
 * Classificação ABC (curva de Pareto) por valor: A = os itens que somam até
 * 80% do valor total, B = até 95%, C = o resto. Prioriza valor de venda (Mix
 * de Vendas já importado) — é o que reflete consumo real; se nenhum mês de
 * vendas foi importado ainda, cai para valor de estoque parado (quantidade x
 * custo) só pra não deixar a classificação vazia.
 */
function calcularCurvaAbc(itens, resumoVendas) {
  const usarVendas = Object.keys(resumoVendas).length > 0;
  const valores = itens.map((item) => ({
    codigo: item.codigo,
    valor: usarVendas ? (resumoVendas[item.codigo]?.totVendas ?? 0) : item.quantidade * (item.precoCusto ?? 0),
  }));
  const totalValor = valores.reduce((s, v) => s + v.valor, 0);
  const ordenado = [...valores].sort((a, b) => b.valor - a.valor);

  const mapa = new Map();
  let acumulado = 0;
  for (const v of ordenado) {
    acumulado += v.valor;
    const pct = totalValor > 0 ? acumulado / totalValor : 1;
    mapa.set(v.codigo, pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C');
  }
  return { mapa, base: usarVendas ? 'vendas' : 'estoque' };
}

export function gerarPainelAlertas(itens) {
  const todasConfigs = getTodasConfigs();
  const pedidosPendentesMapa = getPedidosPendentesMapa();
  const resumoVendas = getResumoVendasPorProduto();
  const { mapa: curvaAbcMapa, base: baseCurvaAbc } = calcularCurvaAbc(itens, resumoVendas);
  const vinculos = listarVinculos();
  const fornecedoresCadastrados = listarFornecedores();

  const classificados = itens.map((item) => {
    const config = todasConfigs[item.codigo] ?? null;
    const pendente = pedidosPendentesMapa[item.codigo] ?? 0;
    const vendaRecente = resumoVendas[item.codigo] ?? null;
    const alerta = classificarItem(item, config, pendente, vendaRecente !== null);
    const setor = config?.setor ?? inferirSetor(item.descricao);
    const precisaFlagGestao = SETORES_FLAG_GESTAO.includes(setor);

    const vinculosDoItem = vinculos
      .filter((v) => v.codigo === item.codigo && v.disponivel)
      .map((v) => ({ ...v, fornecedor: fornecedoresCadastrados.find((f) => f.id === v.fornecedorId) }))
      .filter((v) => v.fornecedor?.ativo);
    vinculosDoItem.sort((a, b) => (a.custoUnitario ?? Infinity) - (b.custoUnitario ?? Infinity));
    const fornecedor = vinculosDoItem[0]?.fornecedor?.nome ?? config?.fornecedor ?? null;

    return {
      ...item,
      alerta,
      setor,
      vendaRecente,
      precisaFlagGestao,
      curvaAbc: curvaAbcMapa.get(item.codigo) ?? 'C',
      baseCurvaAbc,
      fornecedor,
      estoqueMinimo: config?.estoqueMinimo ?? null,
    };
  });

  classificados.sort((a, b) => ORDEM_NIVEL[a.alerta.nivel] - ORDEM_NIVEL[b.alerta.nivel]);
  return classificados;
}
