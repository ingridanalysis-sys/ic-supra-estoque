import { pushSnapshot, pushPedidoUpsert } from './sync/push';

export const CHAVE_SNAPSHOTS = 'ic_supra_snapshots_v1';
export const CHAVE_PEDIDOS = 'ic_supra_pedidos_v1';

// Só os 2 snapshots mais recentes ficam no localStorage — cada um carrega o
// catálogo inteiro (~10 mil itens), então guardar histórico ilimitado aqui
// estoura a cota do navegador. O histórico completo (todo snapshot já
// gerado) é preservado no Supabase, insert-only — ver src/lib/sync/push.js.
const MAX_SNAPSHOTS_LOCAIS = 2;

function ler(chave, padrao) {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? JSON.parse(raw) : padrao;
  } catch {
    return padrao;
  }
}

function salvar(chave, valor) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

// ---------- Snapshots de estoque ----------

export function salvarSnapshot(snapshot) {
  const lista = ler(CHAVE_SNAPSHOTS, []);
  const registro = {
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    resumo: snapshot.resumo,
    itens: snapshot.itens,
    avisos: snapshot.avisos,
  };
  lista.unshift(registro); // mais recente primeiro
  pushSnapshot(registro); // manda o snapshot inteiro pro Supabase antes de truncar localmente
  salvar(CHAVE_SNAPSHOTS, lista.slice(0, MAX_SNAPSHOTS_LOCAIS));
  return registro;
}

export function listarSnapshots() {
  return ler(CHAVE_SNAPSHOTS, []);
}

export function getUltimoSnapshot() {
  const lista = listarSnapshots();
  return lista[0] ?? null;
}

export function getSnapshotAnterior() {
  const lista = listarSnapshots();
  return lista[1] ?? null;
}

// ---------- Pedidos de compra ----------

/**
 * Estrutura de um pedido:
 * {
 *   id, criadoEm, fornecedor,
 *   status: 'pendente' | 'parcial' | 'recebido' | 'cancelado',
 *   motivoCancelamento: string | null, // só preenchido quando status = 'cancelado'
 *   itens: [{ codigo, descricao, unidade, qtdPedida, qtdRecebida, custoUnit }]
 * }
 */

function recalcularStatus(pedido) {
  if (pedido.status === 'cancelado') return; // cancelado nunca volta sozinho
  const totalPedido = pedido.itens.reduce((s, i) => s + i.qtdPedida, 0);
  const totalRecebido = pedido.itens.reduce((s, i) => s + (i.qtdRecebida ?? 0), 0);
  pedido.status = totalRecebido === 0 ? 'pendente' : totalRecebido >= totalPedido ? 'recebido' : 'parcial';
}

export function criarPedido({ fornecedor, itens, observacoes }) {
  const lista = ler(CHAVE_PEDIDOS, []);
  const agora = new Date().toISOString();
  const pedido = {
    id: crypto.randomUUID(),
    criadoEm: agora,
    atualizadoEm: agora,
    fornecedor,
    status: 'pendente',
    observacoes: observacoes || null,
    itens: itens.map((i) => ({ ...i, qtdRecebida: 0 })),
  };
  lista.unshift(pedido);
  salvar(CHAVE_PEDIDOS, lista);
  pushPedidoUpsert(pedido);
  return pedido;
}

export function listarPedidos() {
  return ler(CHAVE_PEDIDOS, []);
}

export function atualizarStatusPedido(id, status) {
  const lista = ler(CHAVE_PEDIDOS, []);
  const idx = lista.findIndex((p) => p.id === id);
  if (idx >= 0) {
    lista[idx].status = status;
    lista[idx].atualizadoEm = new Date().toISOString();
    salvar(CHAVE_PEDIDOS, lista);
    pushPedidoUpsert(lista[idx]);
  }
  return lista[idx];
}

export function registrarRecebimento(id, codigo, qtdRecebidaAdicional) {
  const lista = ler(CHAVE_PEDIDOS, []);
  const pedido = lista.find((p) => p.id === id);
  if (!pedido) return null;
  const item = pedido.itens.find((i) => i.codigo === codigo);
  if (item) {
    item.qtdRecebida = (item.qtdRecebida ?? 0) + qtdRecebidaAdicional;
  }
  recalcularStatus(pedido);
  pedido.atualizadoEm = new Date().toISOString();
  salvar(CHAVE_PEDIDOS, lista);
  pushPedidoUpsert(pedido);
  return pedido;
}

/**
 * Cancela um pedido (o motivo fica registrado e visível no histórico) — não
 * some da lista, só muda de status. Diferente de "recebido"/"parcial", um
 * pedido cancelado nunca é recalculado automaticamente por recebimento.
 */
export function cancelarPedido(id, motivo) {
  const lista = ler(CHAVE_PEDIDOS, []);
  const pedido = lista.find((p) => p.id === id);
  if (!pedido) return null;
  pedido.status = 'cancelado';
  pedido.motivoCancelamento = motivo;
  pedido.atualizadoEm = new Date().toISOString();
  salvar(CHAVE_PEDIDOS, lista);
  pushPedidoUpsert(pedido);
  return pedido;
}

/**
 * Edita um pedido já criado — fornecedor e/ou a lista de itens (permite
 * corrigir quantidade/custo, remover item, ou adicionar um item que ficou de
 * fora na hora de montar a ordem original). O status é recalculado a partir
 * do novo total pedido x já recebido, a não ser que o pedido esteja
 * cancelado (edição não reabre um pedido cancelado).
 */
export function editarPedido(id, { fornecedor, itens }) {
  const lista = ler(CHAVE_PEDIDOS, []);
  const pedido = lista.find((p) => p.id === id);
  if (!pedido) return null;
  if (fornecedor !== undefined) pedido.fornecedor = fornecedor;
  if (itens !== undefined) pedido.itens = itens;
  recalcularStatus(pedido);
  pedido.atualizadoEm = new Date().toISOString();
  salvar(CHAVE_PEDIDOS, lista);
  pushPedidoUpsert(pedido);
  return pedido;
}

/**
 * Soma, entre todos os pedidos ainda não totalmente recebidos, quanto de um
 * determinado código já está "a caminho" — usado no motor de alertas para
 * não sugerir comprar de novo o que já foi pedido.
 */
export function getPedidosPendentesPorCodigo(codigo) {
  const lista = ler(CHAVE_PEDIDOS, []);
  let pendente = 0;
  for (const pedido of lista) {
    if (pedido.status === 'recebido' || pedido.status === 'cancelado') continue;
    const item = pedido.itens.find((i) => i.codigo === codigo);
    if (item) {
      pendente += Math.max(0, item.qtdPedida - (item.qtdRecebida ?? 0));
    }
  }
  return pendente;
}

/**
 * Versão em lote de getPedidosPendentesPorCodigo: lê o localStorage UMA vez
 * e devolve um mapa { codigo: quantidadePendente }. Usada pelo motor de
 * alertas para classificar milhares de itens sem reabrir o localStorage a
 * cada item (isso sozinho já travava a tela com o catálogo completo).
 */
export function getPedidosPendentesMapa() {
  const lista = ler(CHAVE_PEDIDOS, []);
  const mapa = {};
  for (const pedido of lista) {
    if (pedido.status === 'recebido' || pedido.status === 'cancelado') continue;
    for (const item of pedido.itens) {
      const pendente = Math.max(0, item.qtdPedida - (item.qtdRecebida ?? 0));
      if (pendente > 0) mapa[item.codigo] = (mapa[item.codigo] ?? 0) + pendente;
    }
  }
  return mapa;
}
