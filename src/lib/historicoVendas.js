// Guarda cada mês de vendas importado, indexado pela chave do mês
// ("2026-06"). Reimportar o mesmo mês SOBRESCREVE (o chamador deve
// confirmar com o usuário antes — ver ImportarVendas.jsx), nunca duplica.

import { pushVendasMes, pushRemoverVendasMes } from './sync/push';

export const CHAVE_VENDAS_MENSAIS = 'ic_supra_vendas_mensais_v1';
const CHAVE = CHAVE_VENDAS_MENSAIS;

function ler() {
  try {
    const raw = localStorage.getItem(CHAVE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function salvar(obj) {
  localStorage.setItem(CHAVE, JSON.stringify(obj));
}

export function getTodasVendas() {
  return ler();
}

export function getVendasMes(mesChave) {
  return ler()[mesChave] ?? null;
}

export function mesJaImportado(mesChave) {
  const todos = ler();
  return Object.prototype.hasOwnProperty.call(todos, mesChave);
}

/**
 * Salva/sobrescreve um mês de vendas. Devolve o registro salvo.
 */
export function salvarVendasMes(relatorioParsed, nomeArquivo) {
  const todos = ler();
  const chave = relatorioParsed.mesChave ?? `desconhecido-${Date.now()}`;
  const registro = {
    mesChave: chave,
    mesLabel: relatorioParsed.mesLabel,
    periodoInicio: relatorioParsed.periodoInicio,
    periodoFim: relatorioParsed.periodoFim,
    itens: relatorioParsed.itens,
    resumo: relatorioParsed.resumo,
    nomeArquivo,
    importadoEm: new Date().toISOString(),
  };
  todos[chave] = registro;
  salvar(todos);
  pushVendasMes(registro);
  return registro;
}

export function removerVendasMes(mesChave) {
  const todos = ler();
  delete todos[mesChave];
  salvar(todos);
  pushRemoverVendasMes(mesChave);
}

/**
 * Lista os meses importados, ordenados cronologicamente (mais antigo primeiro).
 */
export function listarMesesImportados() {
  const todos = ler();
  return Object.values(todos).sort((a, b) => (a.mesChave < b.mesChave ? -1 : 1));
}

/**
 * Soma volume e faturamento por código de produto, considerando TODOS os
 * meses de vendas importados (Mix de Vendas). É a fonte única usada tanto
 * para decidir se um produto tem "venda recente registrada" (proteção contra
 * descontinuação — ver alertas.js) quanto para mostrar faturamento/volume na
 * aba Alertas de Compra.
 *
 * Um código aparecer aqui (mesmo com valores baixos) significa que ele
 * vendeu em algum mês importado — meses sem venda de um produto simplesmente
 * não o listam, então presença no mapa = venda real registrada.
 */
export function getResumoVendasPorProduto() {
  const meses = listarMesesImportados();
  const resumo = {};
  for (const mes of meses) {
    for (const item of mes.itens) {
      const atual = resumo[item.codigo] ?? { qtdeVolumes: 0, totVendas: 0 };
      atual.qtdeVolumes += item.qtdeVolumes;
      atual.totVendas += item.totVendas;
      resumo[item.codigo] = atual;
    }
  }
  return resumo;
}

/**
 * Conjunto de códigos com pelo menos uma venda registrada em algum mês
 * importado. Usado para proteger produtos de qualquer marcação de
 * "descontinuado" — zerado no estoque significa "precisa comprar", nunca
 * "descontinuar", quando o item vende.
 */
export function getCodigosComVendaRegistrada() {
  return new Set(Object.keys(getResumoVendasPorProduto()));
}
