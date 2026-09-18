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

  // Quantidade sugerida pra compra: sobe o estoque até um "nível-alvo" que
  // cobre DOIS ciclos completos de reposição (2x o ponto de pedido, ou 2x o
  // mínimo cadastrado — o maior dos dois), calculado a partir do giro real
  // de vendas (giroAutomatico.js, alimentado pelo Mix de Vendas importado) —
  // é assim que a incidência no faturamento dos meses anteriores entra na
  // conta. Sem giro nem mínimo cadastrados ainda pra esse produto, cai num
  // ponto de partida pelo ticket: item caro sugere só 1 unidade, item barato
  // sugere um lote maior — nunca "1" fixo pra tudo.
  const LIMIAR_TICKET_ALTO = 50; // R$ — acima disso conta como "ticket alto"
  let nivelAlvoEstoque = null;
  if (pontoPedido != null) nivelAlvoEstoque = pontoPedido * 2;
  if (estoqueMinimo != null) nivelAlvoEstoque = Math.max(nivelAlvoEstoque ?? 0, estoqueMinimo * 2);
  const quantidadeSugerida = nivelAlvoEstoque != null
    ? Math.max(0, Math.ceil(nivelAlvoEstoque - saldoConsiderandoPedidos))
    : ((item.precoCusto ?? 0) > LIMIAR_TICKET_ALTO ? 1 : 5);

  if (item.quantidade < 0) {
    return {
      nivel: 'NEGATIVO',
      motivo: 'Divergência de contagem — confira antes de repor.',
      diasCobertura: null,
      saldoConsiderandoPedidos,
      pontoPedido,
      // Aqui não é uma sugestão de compra normal — é o quanto zeraria a
      // divergência de contagem. O comprador deve conferir antes de repor.
      quantidadeSugerida: Math.abs(item.quantidade),
    };
  }

  const vendeu = temVendaRegistrada !== undefined
    ? temVendaRegistrada
    : Object.prototype.hasOwnProperty.call(getResumoVendasPorProduto(), item.codigo);

  if (cfg?.descontinuado && !vendeu) {
    return { nivel: 'OK', motivo: 'Produto marcado como descontinuado — ignorado nos alertas.', diasCobertura: null, saldoConsiderandoPedidos, pontoPedido, quantidadeSugerida: 0 };
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
      quantidadeSugerida,
    };
  }

  if (diasCobertura !== null && diasCobertura <= leadTimeDias + margemSegurancaDias) {
    return {
      nivel: 'CRITICO',
      motivo: `Cobertura de ${diasCobertura.toFixed(1)} dia(s) — menor que o lead time do fornecedor (${leadTimeDias}d) + margem de segurança (${margemSegurancaDias}d).`,
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
      quantidadeSugerida,
    };
  }

  if (estoqueMinimo !== null && saldoConsiderandoPedidos < estoqueMinimo) {
    return {
      nivel: 'ATENCAO',
      motivo: `Estoque (${saldoConsiderandoPedidos}) abaixo do mínimo cadastrado (${estoqueMinimo}).`,
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
      quantidadeSugerida,
    };
  }

  if (estoqueMinimo !== null && saldoConsiderandoPedidos < estoqueMinimo * 1.5) {
    return {
      nivel: 'MONITORAR',
      motivo: 'Estoque com folga reduzida em relação ao mínimo cadastrado.',
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
      quantidadeSugerida,
    };
  }

  if (diasCobertura !== null && diasCobertura <= (leadTimeDias + margemSegurancaDias) * 2) {
    return {
      nivel: 'MONITORAR',
      motivo: `Cobertura de ${diasCobertura.toFixed(1)} dia(s) — folga reduzida.`,
      diasCobertura,
      saldoConsiderandoPedidos,
      pontoPedido,
      quantidadeSugerida,
    };
  }

  return { nivel: 'OK', motivo: 'Estoque em nível confortável.', diasCobertura, saldoConsiderandoPedidos, pontoPedido, quantidadeSugerida };
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
 * Classificação ABC (curva de Pareto) por valor, calculada DENTRO DE CADA
 * SETOR (não no catálogo inteiro) — A = os itens que somam até 80% do valor
 * do próprio setor, B = até 95%, C = o resto. Uma curva ABC global deixaria
 * setores de menor faturamento total (ex: Ostomia, Respiratório) quase sem
 * nenhum item em A, mesmo tendo itens que são o carro-chefe DENTRO daquele
 * setor — o que não ajuda a priorizar compra por segmento. Prioriza valor
 * de venda (Mix de Vendas já importado) — é o que reflete consumo real; se
 * nenhum mês de vendas foi importado ainda, cai para valor de estoque
 * parado (quantidade x custo) só pra não deixar a classificação vazia.
 */
function calcularCurvaAbcPorSetor(itensComSetor, resumoVendas) {
  const usarVendas = Object.keys(resumoVendas).length > 0;
  const porSetor = new Map();
  for (const { item, setor } of itensComSetor) {
    if (!porSetor.has(setor)) porSetor.set(setor, []);
    porSetor.get(setor).push({
      codigo: item.codigo,
      valor: usarVendas ? (resumoVendas[item.codigo]?.totVendas ?? 0) : item.quantidade * (item.precoCusto ?? 0),
    });
  }

  const mapa = new Map();
  for (const valores of porSetor.values()) {
    const totalValor = valores.reduce((s, v) => s + v.valor, 0);

    // Nenhum item do setor tem valor conhecido (sem venda importada pra
    // nenhum deles, e sem custo/estoque também) — não tem base pra
    // diferenciar prioridade dentro do setor, então todos ficam em C (o
    // valor mais baixo de confiança), nunca em A por falta de dados.
    if (totalValor <= 0) {
      for (const v of valores) mapa.set(v.codigo, 'C');
      continue;
    }

    const ordenado = [...valores].sort((a, b) => b.valor - a.valor);
    let acumulado = 0;
    for (const v of ordenado) {
      // Compara o acumulado ANTES de somar este item — é o que classifica
      // corretamente o item que sozinho já é a maior parte (ou até 100%) do
      // valor do setor como 'A': o acumulado antes dele é 0%, então ele
      // sempre entra em A, mesmo num setor com 1 ou 2 itens só. Comparar
      // o acumulado DEPOIS (como antes) empurrava esse item pra C só
      // porque ele mesmo já fecha 100% — o item mais importante do setor
      // não pode ser classificado como o menos importante.
      const pctAntes = acumulado / totalValor;
      acumulado += v.valor;
      mapa.set(v.codigo, pctAntes < 0.8 ? 'A' : pctAntes < 0.95 ? 'B' : 'C');
    }
  }
  return { mapa, base: usarVendas ? 'vendas' : 'estoque' };
}

export function gerarPainelAlertas(itens) {
  const todasConfigs = getTodasConfigs();
  const pedidosPendentesMapa = getPedidosPendentesMapa();
  const resumoVendas = getResumoVendasPorProduto();
  const vinculos = listarVinculos();
  const fornecedoresCadastrados = listarFornecedores();

  // Setor precisa estar resolvido ANTES da curva ABC, já que ela agora é
  // calculada por setor — evita rodar inferirSetor() duas vezes por item.
  const itensComSetor = itens.map((item) => ({
    item,
    setor: todasConfigs[item.codigo]?.setor ?? inferirSetor(item.descricao),
  }));
  const { mapa: curvaAbcMapa, base: baseCurvaAbc } = calcularCurvaAbcPorSetor(itensComSetor, resumoVendas);

  const classificados = itensComSetor.map(({ item, setor }) => {
    const config = todasConfigs[item.codigo] ?? null;
    const pendente = pedidosPendentesMapa[item.codigo] ?? 0;
    const vendaRecente = resumoVendas[item.codigo] ?? null;
    const alerta = classificarItem(item, config, pendente, vendaRecente !== null);
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
