// Guarda cada mês de vendas importado, indexado pela chave do mês
// ("2026-06"). Reimportar o mesmo mês SOBRESCREVE (o chamador deve
// confirmar com o usuário antes — ver ImportarVendas.jsx), nunca duplica.

import { pushVendasMes, pushRemoverVendasMes } from './sync/push';
import { salvarLocalComFallback } from './storageSeguro';

export const CHAVE_VENDAS_MENSAIS = 'ic_supra_vendas_mensais_v1';
const CHAVE = CHAVE_VENDAS_MENSAIS;

// Cada mês guarda o item a item de todo o catálogo vendido — sem limite,
// isso cresce pra sempre e, junto com o snapshot de estoque (~10 mil
// itens), estoura a cota do navegador (visto na prática). Só os meses mais
// recentes ficam em cache local; o histórico completo (todo mês já
// importado) é preservado no Supabase, puxado de volta quando precisar —
// ver src/lib/sync/pull.js. "Todos os meses importados" nos filtros da UI
// reflete o que está em cache local, não necessariamente o histórico
// inteiro desde sempre.
export const MAX_MESES_LOCAIS = 6;

/** Mantém só os N meses mais recentes (por mesChave) — usado aqui e em src/lib/sync/pull.js. */
export function podarParaLimiteLocal(obj) {
  const chaves = Object.keys(obj).sort();
  const recentes = chaves.slice(-MAX_MESES_LOCAIS);
  const podado = {};
  for (const k of recentes) podado[k] = obj[k];
  return podado;
}

function ler() {
  try {
    const raw = localStorage.getItem(CHAVE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function salvar(obj) {
  salvarLocalComFallback(CHAVE, podarParaLimiteLocal(obj));
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
  // Push antes do salvamento local: se o localStorage estiver cheio e
  // lançar (ou o podado remover esse mês da lista local), o envio pro
  // Supabase já foi disparado mesmo assim — o histórico completo lá nunca
  // é podado.
  pushVendasMes(registro);
  salvar(todos);
  return registro;
}

export function removerVendasMes(mesChave) {
  const todos = ler();
  delete todos[mesChave];
  pushRemoverVendasMes(mesChave);
  salvar(todos);
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
