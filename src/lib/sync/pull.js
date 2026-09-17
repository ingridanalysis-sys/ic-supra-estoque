// Puxa tudo do Supabase pro localStorage, uma vez, no início da sessão (ver
// App.jsx). NUNCA sobrescreve o blob inteiro com a versão do servidor — faz
// merge registro a registro comparando `atualizadoEm`, porque uma escrita
// local pode ter acontecido antes deste pull terminar (ver comentário sobre
// a corrida em App.jsx). Nunca lança: uma falha aqui deixa o app seguir
// com o que já tinha no localStorage.

import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { CHAVE_CONFIG_PRODUTOS } from '../configProdutos';
import { CHAVE_SNAPSHOTS, CHAVE_PEDIDOS } from '../historicoPedidos';
import { CHAVE_VENDAS_MENSAIS } from '../historicoVendas';

function lerLocal(chave, padrao) {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? JSON.parse(raw) : padrao;
  } catch {
    return padrao;
  }
}

function salvarLocal(chave, valor) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

async function puxarConfigProdutos() {
  const { data, error } = await supabase.from('config_produtos').select('*');
  if (error) throw error;

  const local = lerLocal(CHAVE_CONFIG_PRODUTOS, {});
  for (const row of data ?? []) {
    const remoto = {
      estoqueMinimo: row.estoque_minimo,
      giroSemanal: row.giro_semanal,
      giroOrigem: row.giro_origem,
      leadTimeDias: row.lead_time_dias,
      margemSegurancaDias: row.margem_seguranca_dias,
      fornecedor: row.fornecedor,
      setor: row.setor,
      descontinuado: row.descontinuado,
      atualizadoEm: row.atualizado_em,
    };
    const existente = local[row.codigo];
    if (!existente || new Date(remoto.atualizadoEm) > new Date(existente.atualizadoEm ?? 0)) {
      local[row.codigo] = remoto;
    }
  }
  salvarLocal(CHAVE_CONFIG_PRODUTOS, local);
}

async function puxarSnapshots() {
  const { data: snaps, error } = await supabase
    .from('snapshots_estoque')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(2);
  if (error) throw error;
  if (!snaps || snaps.length === 0) return;

  const ids = snaps.map((s) => s.id);
  const { data: itens, error: erroItens } = await supabase
    .from('itens_estoque')
    .select('*')
    .in('snapshot_id', ids);
  if (erroItens) throw erroItens;

  const itensPorSnapshot = new Map();
  for (const it of itens ?? []) {
    if (!itensPorSnapshot.has(it.snapshot_id)) itensPorSnapshot.set(it.snapshot_id, []);
    itensPorSnapshot.get(it.snapshot_id).push({
      codigo: it.codigo,
      codigoBarras: it.codigo_barras,
      descricao: it.descricao,
      unidade: it.unidade,
      precoCusto: Number(it.preco_custo),
      quantidade: Number(it.quantidade),
      total: Number(it.total),
      origem: it.origem,
      confianca: it.confianca,
    });
  }

  const remotos = snaps.map((s) => ({
    id: s.id,
    criadoEm: s.criado_em,
    resumo: {
      totalItens: s.total_itens,
      valorTotalEstoque: Number(s.valor_total_estoque),
      itensNegativos: s.itens_negativos,
      itensZerados: s.itens_zerados,
      itensPositivos: s.itens_positivos,
    },
    itens: itensPorSnapshot.get(s.id) ?? [],
    avisos: [],
  }));

  const local = lerLocal(CHAVE_SNAPSHOTS, []);
  const porId = new Map(local.map((s) => [s.id, s]));
  // snapshot é imutável depois de criado — a versão do servidor sempre pode
  // prevalecer com segurança quando o id já existe dos dois lados.
  for (const r of remotos) porId.set(r.id, r);
  const unidos = Array.from(porId.values()).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  salvarLocal(CHAVE_SNAPSHOTS, unidos.slice(0, 2));
}

async function puxarPedidos() {
  const { data: pedidos, error } = await supabase.from('pedidos_compra').select('*');
  if (error) throw error;
  if (!pedidos || pedidos.length === 0) return;

  const ids = pedidos.map((p) => p.id);
  const { data: itens, error: erroItens } = await supabase
    .from('itens_pedido_compra')
    .select('*')
    .in('pedido_id', ids);
  if (erroItens) throw erroItens;

  const itensPorPedido = new Map();
  for (const it of itens ?? []) {
    if (!itensPorPedido.has(it.pedido_id)) itensPorPedido.set(it.pedido_id, []);
    itensPorPedido.get(it.pedido_id).push({
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidade,
      qtdPedida: Number(it.qtd_pedida),
      qtdRecebida: Number(it.qtd_recebida),
      custoUnit: Number(it.custo_unit),
    });
  }

  const local = lerLocal(CHAVE_PEDIDOS, []);
  const porId = new Map(local.map((p) => [p.id, p]));
  for (const p of pedidos) {
    const remoto = {
      id: p.id,
      criadoEm: p.criado_em,
      atualizadoEm: p.atualizado_em,
      fornecedor: p.fornecedor,
      status: p.status,
      observacoes: p.observacoes,
      motivoCancelamento: p.motivo_cancelamento,
      itens: itensPorPedido.get(p.id) ?? [],
    };
    const existente = porId.get(p.id);
    if (!existente || new Date(remoto.atualizadoEm) > new Date(existente.atualizadoEm ?? existente.criadoEm ?? 0)) {
      porId.set(p.id, remoto);
    }
  }
  const unidos = Array.from(porId.values()).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  salvarLocal(CHAVE_PEDIDOS, unidos);
}

async function puxarVendas() {
  const { data: meses, error } = await supabase.from('vendas_mensais').select('*');
  if (error) throw error;
  if (!meses || meses.length === 0) return;

  const chaves = meses.map((m) => m.mes_chave);
  const { data: itens, error: erroItens } = await supabase
    .from('itens_venda_mensal')
    .select('*')
    .in('mes_chave', chaves);
  if (erroItens) throw erroItens;

  const itensPorMes = new Map();
  for (const it of itens ?? []) {
    if (!itensPorMes.has(it.mes_chave)) itensPorMes.set(it.mes_chave, []);
    itensPorMes.get(it.mes_chave).push({
      codigo: it.codigo,
      codigoBarras: it.codigo_barras,
      descricao: it.descricao,
      unidade: it.unidade,
      qtdeNotas: Number(it.qtde_notas),
      qtdeVolumes: Number(it.qtde_volumes),
      totComissoes: Number(it.tot_comissoes),
      totVendas: Number(it.tot_vendas),
    });
  }

  const local = lerLocal(CHAVE_VENDAS_MENSAIS, {});
  for (const m of meses) {
    const remoto = {
      mesChave: m.mes_chave,
      mesLabel: m.mes_label,
      periodoInicio: m.periodo_inicio,
      periodoFim: m.periodo_fim,
      resumo: m.resumo,
      nomeArquivo: m.nome_arquivo,
      importadoEm: m.importado_em,
      itens: itensPorMes.get(m.mes_chave) ?? [],
    };
    const existente = local[m.mes_chave];
    if (!existente || new Date(remoto.importadoEm) > new Date(existente.importadoEm ?? 0)) {
      local[m.mes_chave] = remoto;
    }
  }
  salvarLocal(CHAVE_VENDAS_MENSAIS, local);
}

/**
 * Roda uma vez no início da sessão (App.jsx). Não faz nada se o Supabase não
 * estiver configurado. Nunca lança — cada tabela é independente, uma falha
 * numa não impede as outras, e uma falha geral só significa que o app segue
 * com o que já tinha no localStorage.
 */
export async function pullTudoDoSupabase() {
  if (!isSupabaseConfigured()) return;
  const resultados = await Promise.allSettled([
    puxarConfigProdutos(),
    puxarSnapshots(),
    puxarPedidos(),
    puxarVendas(),
  ]);
  for (const r of resultados) {
    if (r.status === 'rejected') {
      console.warn('[sync] Falha ao puxar dados do Supabase — o app segue com o que já tinha localmente.', r.reason);
    }
  }
}
