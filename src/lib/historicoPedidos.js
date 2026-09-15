const CHAVE_SNAPSHOTS = 'ic_supra_snapshots_v1';
const CHAVE_PEDIDOS = 'ic_supra_pedidos_v1';

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
  salvar(CHAVE_SNAPSHOTS, lista);
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
 *   id, criadoEm, fornecedor, status: 'pendente' | 'parcial' | 'recebido',
 *   itens: [{ codigo, descricao, unidade, qtdPedida, qtdRecebida, custoUnit }]
 * }
 */

export function criarPedido({ fornecedor, itens }) {
  const lista = ler(CHAVE_PEDIDOS, []);
  const pedido = {
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    fornecedor,
    status: 'pendente',
    itens: itens.map((i) => ({ ...i, qtdRecebida: 0 })),
  };
  lista.unshift(pedido);
  salvar(CHAVE_PEDIDOS, lista);
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
    salvar(CHAVE_PEDIDOS, lista);
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
  const totalPedido = pedido.itens.reduce((s, i) => s + i.qtdPedida, 0);
  const totalRecebido = pedido.itens.reduce((s, i) => s + (i.qtdRecebida ?? 0), 0);
  pedido.status = totalRecebido === 0 ? 'pendente' : totalRecebido >= totalPedido ? 'recebido' : 'parcial';
  salvar(CHAVE_PEDIDOS, lista);
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
    if (pedido.status === 'recebido') continue;
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
    if (pedido.status === 'recebido') continue;
    for (const item of pedido.itens) {
      const pendente = Math.max(0, item.qtdPedida - (item.qtdRecebida ?? 0));
      if (pendente > 0) mapa[item.codigo] = (mapa[item.codigo] ?? 0) + pendente;
    }
  }
  return mapa;
}
