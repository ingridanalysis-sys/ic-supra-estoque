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
import { inferirSetor } from './setores';

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
 */
export function classificarItem(item, config = undefined, pendente = undefined) {
  const cfg = config !== undefined ? config : getConfigProduto(item.codigo);
  const pendenteResolvido = pendente !== undefined ? pendente : getPedidosPendentesPorCodigo(item.codigo);
  const saldoConsiderandoPedidos = item.quantidade + pendenteResolvido;

  if (item.quantidade < 0) {
    return {
      nivel: 'NEGATIVO',
      motivo: 'Divergência de contagem — confira antes de repor.',
      diasCobertura: null,
      saldoConsiderandoPedidos,
    };
  }

  if (cfg?.descontinuado) {
    return { nivel: 'OK', motivo: 'Produto marcado como descontinuado — ignorado nos alertas.', diasCobertura: null, saldoConsiderandoPedidos };
  }

  const giroSemanal = cfg?.giroSemanal ?? null;
  const leadTimeDias = cfg?.leadTimeDias ?? 7; // padrão conservador se não cadastrado
  const margemSegurancaDias = cfg?.margemSegurancaDias ?? 3;
  const estoqueMinimo = cfg?.estoqueMinimo ?? null;

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
    };
  }

  if (diasCobertura !== null && diasCobertura <= leadTimeDias + margemSegurancaDias) {
    return {
      nivel: 'CRITICO',
      motivo: `Cobertura de ${diasCobertura.toFixed(1)} dia(s) — menor que o lead time do fornecedor (${leadTimeDias}d) + margem de segurança (${margemSegurancaDias}d).`,
      diasCobertura,
      saldoConsiderandoPedidos,
    };
  }

  if (estoqueMinimo !== null && saldoConsiderandoPedidos < estoqueMinimo) {
    return {
      nivel: 'ATENCAO',
      motivo: `Estoque (${saldoConsiderandoPedidos}) abaixo do mínimo cadastrado (${estoqueMinimo}).`,
      diasCobertura,
      saldoConsiderandoPedidos,
    };
  }

  if (estoqueMinimo !== null && saldoConsiderandoPedidos < estoqueMinimo * 1.5) {
    return {
      nivel: 'MONITORAR',
      motivo: 'Estoque com folga reduzida em relação ao mínimo cadastrado.',
      diasCobertura,
      saldoConsiderandoPedidos,
    };
  }

  if (diasCobertura !== null && diasCobertura <= (leadTimeDias + margemSegurancaDias) * 2) {
    return {
      nivel: 'MONITORAR',
      motivo: `Cobertura de ${diasCobertura.toFixed(1)} dia(s) — folga reduzida.`,
      diasCobertura,
      saldoConsiderandoPedidos,
    };
  }

  return { nivel: 'OK', motivo: 'Estoque em nível confortável.', diasCobertura, saldoConsiderandoPedidos };
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

export function gerarPainelAlertas(itens) {
  const todasConfigs = getTodasConfigs();
  const pedidosPendentesMapa = getPedidosPendentesMapa();

  const classificados = itens.map((item) => {
    const config = todasConfigs[item.codigo] ?? null;
    const pendente = pedidosPendentesMapa[item.codigo] ?? 0;
    const alerta = classificarItem(item, config, pendente);
    const setor = config?.setor ?? inferirSetor(item.descricao);
    return { ...item, alerta, setor };
  });

  classificados.sort((a, b) => ORDEM_NIVEL[a.alerta.nivel] - ORDEM_NIVEL[b.alerta.nivel]);
  return classificados;
}
