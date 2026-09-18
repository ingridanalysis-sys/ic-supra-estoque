// O giro semanal alimenta o cálculo de "dias de cobertura" no motor de
// alertas (src/lib/alertas.js). Antes, era 100% manual por produto. Agora,
// com os relatórios de vendas importados, calculamos automaticamente a
// partir do volume vendido real — e só isso, nunca por descrição/suposição.
//
// Regra de precedência: se o usuário editou o giro manualmente (giroOrigem
// === 'manual'), o cálculo automático NÃO sobrescreve. Isso evita que uma
// nova importação de vendas apague um ajuste fino que o usuário fez à mão.

import { getTodasConfigs, importarConfigsEmLote } from './configProdutos';
import { listarMesesImportados } from './historicoVendas';

const SEMANAS_POR_MES = 4.345; // média (30,44 dias / 7)

/**
 * Soma o volume vendido por produto em todos os meses importados e calcula
 * a média mensal (meses sem venda registrada contam como zero — é sinal
 * real de que não vendeu, não dado faltante).
 */
export function calcularGiroSemanalPorProduto() {
  const meses = listarMesesImportados();
  if (meses.length === 0) return { porProduto: {}, mesesConsiderados: 0 };

  const totalPorCodigo = {};
  for (const mes of meses) {
    for (const item of mes.itens) {
      totalPorCodigo[item.codigo] = (totalPorCodigo[item.codigo] ?? 0) + item.qtdeVolumes;
    }
  }

  const porProduto = {};
  for (const [codigo, totalVolumes] of Object.entries(totalPorCodigo)) {
    const mediaMensal = totalVolumes / meses.length;
    porProduto[codigo] = Math.round((mediaMensal / SEMANAS_POR_MES) * 100) / 100;
  }

  return { porProduto, mesesConsiderados: meses.length };
}

/**
 * Aplica o giro calculado a configProdutos, sem tocar em produtos cujo giro
 * foi editado manualmente. Devolve um resumo pra mostrar na tela.
 */
export function aplicarGiroAutomatico() {
  const { porProduto, mesesConsiderados } = calcularGiroSemanalPorProduto();
  if (mesesConsiderados === 0) return { atualizados: 0, ignoradosManual: 0, mesesConsiderados: 0 };

  const configsAtuais = getTodasConfigs();
  const lote = {};
  let atualizados = 0;
  let ignoradosManual = 0;

  for (const [codigo, giroSemanal] of Object.entries(porProduto)) {
    const cfgAtual = configsAtuais[codigo];
    if (cfgAtual?.giroOrigem === 'manual') {
      ignoradosManual += 1;
      continue;
    }
    lote[codigo] = { giroSemanal, giroOrigem: 'automatico' };
    atualizados += 1;
  }

  importarConfigsEmLote(lote);
  return { atualizados, ignoradosManual, mesesConsiderados };
}

/**
 * Estoque mínimo automático = estoque de segurança do próprio ponto de
 * pedido já usado no motor de alertas (src/lib/alertas.js):
 *
 *   pontoPedido   = giroDiario × (leadTimeDias + margemSegurancaDias)
 *   estoqueMinimo = giroDiario × margemSegurancaDias
 *
 * ou seja, o mínimo é exatamente a parcela de "margem de segurança" dentro
 * do ponto de pedido — não é um número novo inventado, é a mesma fórmula já
 * validada, só isolando o termo de segurança. Isso é o que garante que os
 * dois números (mínimo e ponto de pedido) sempre fazem sentido juntos.
 *
 * Só calcula pra produto que já tem giro conhecido (automático ou manual —
 * ver calcularGiroSemanalPorProduto) E cujo mínimo não foi ajustado à mão
 * (estoqueMinimoOrigem !== 'manual'), pelo mesmo motivo do giro: uma nova
 * importação de vendas não pode apagar um ajuste fino que o usuário fez.
 * Produto sem nenhuma venda importada não entra aqui — não tem base real
 * pra calcular, e um número inventado seria pior que deixar em branco.
 */
export function aplicarMinimoAutomatico() {
  const configsAtuais = getTodasConfigs();
  const lote = {};
  let atualizados = 0;
  let ignoradosManual = 0;
  let semGiro = 0;

  for (const [codigo, cfg] of Object.entries(configsAtuais)) {
    const giroSemanal = cfg?.giroSemanal;
    if (!giroSemanal || giroSemanal <= 0) { semGiro += 1; continue; }
    if (cfg?.estoqueMinimoOrigem === 'manual') { ignoradosManual += 1; continue; }

    const margemSegurancaDias = cfg?.margemSegurancaDias ?? 3;
    const estoqueMinimo = Math.ceil((giroSemanal / 7) * margemSegurancaDias);
    lote[codigo] = { estoqueMinimo, estoqueMinimoOrigem: 'automatico' };
    atualizados += 1;
  }

  importarConfigsEmLote(lote);
  return { atualizados, ignoradosManual, semGiro };
}
