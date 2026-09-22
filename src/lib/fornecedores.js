// Cadastro de fornecedores e o vínculo produto↔fornecedor (custo e
// disponibilidade são por PAR — o mesmo produto pode ter fornecedores
// diferentes, cada um com seu preço e podendo estar indisponível só
// naquele fornecedor). Local-first: grava em localStorage e empurra pro
// Supabase em segundo plano (ver src/lib/sync/push.js e pull.js), no mesmo
// padrão de src/lib/historicoPedidos.js.

import { getConfigProduto } from './configProdutos';
import {
  pushFornecedorUpsert,
  pushVinculoUpsert,
  pushRemoverVinculo,
} from './sync/push';
import { salvarLocalComFallback } from './storageSeguro';

export const CHAVE_FORNECEDORES = 'ic_supra_fornecedores_v1';
export const CHAVE_VINCULOS = 'ic_supra_produto_fornecedor_v1';

function ler(chave, padrao) {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? JSON.parse(raw) : padrao;
  } catch {
    return padrao;
  }
}

function salvar(chave, valor) {
  salvarLocalComFallback(chave, valor);
}

// ---------- Fornecedores ----------

/**
 * Estrutura de um fornecedor:
 * { id, nome, email, telefone, envioAutomatico, ativo, criadoEm, atualizadoEm }
 */

export function listarFornecedores() {
  return ler(CHAVE_FORNECEDORES, []);
}

export function getFornecedor(id) {
  return listarFornecedores().find((f) => f.id === id) ?? null;
}

export function criarFornecedor({ nome, email, telefone, envioAutomatico }) {
  const lista = ler(CHAVE_FORNECEDORES, []);
  const agora = new Date().toISOString();
  const fornecedor = {
    id: crypto.randomUUID(),
    nome: nome.trim(),
    email: email?.trim() || null,
    telefone: telefone?.trim() || null,
    envioAutomatico: !!envioAutomatico,
    ativo: true,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  lista.push(fornecedor);
  salvar(CHAVE_FORNECEDORES, lista);
  pushFornecedorUpsert(fornecedor);
  return fornecedor;
}

export function atualizarFornecedor(id, dados) {
  const lista = ler(CHAVE_FORNECEDORES, []);
  const fornecedor = lista.find((f) => f.id === id);
  if (!fornecedor) return null;
  Object.assign(fornecedor, dados, { atualizadoEm: new Date().toISOString() });
  salvar(CHAVE_FORNECEDORES, lista);
  pushFornecedorUpsert(fornecedor);
  return fornecedor;
}

/** Nunca apaga de fato (pedidos antigos referenciam o fornecedor pelo nome) — só desativa. */
export function desativarFornecedor(id) {
  return atualizarFornecedor(id, { ativo: false });
}

/** Busca (case-insensitive) ou cria um fornecedor pelo nome — usado pela migração abaixo. */
function encontrarOuCriarPorNome(nome) {
  const nomeNormalizado = nome.trim().toLowerCase();
  const existente = listarFornecedores().find((f) => f.nome.trim().toLowerCase() === nomeNormalizado);
  if (existente) return existente;
  return criarFornecedor({ nome: nome.trim() });
}

// ---------- Vínculo produto ↔ fornecedor ----------

/**
 * Estrutura de um vínculo:
 * { id, codigo, fornecedorId, custoUnitario, disponivel, atualizadoEm }
 */

export function listarVinculos() {
  return ler(CHAVE_VINCULOS, []);
}

export function listarVinculosPorCodigo(codigo) {
  return listarVinculos().filter((v) => v.codigo === codigo);
}

export function listarVinculosPorFornecedor(fornecedorId) {
  return listarVinculos().filter((v) => v.fornecedorId === fornecedorId);
}

/** Cria o vínculo se não existir, ou atualiza custo/disponibilidade se já existir (chave única codigo+fornecedorId). */
export function vincularProdutoFornecedor(codigo, fornecedorId, { custoUnitario, disponivel } = {}) {
  const lista = ler(CHAVE_VINCULOS, []);
  let vinculo = lista.find((v) => v.codigo === codigo && v.fornecedorId === fornecedorId);
  const agora = new Date().toISOString();
  if (vinculo) {
    if (custoUnitario !== undefined) vinculo.custoUnitario = custoUnitario;
    if (disponivel !== undefined) vinculo.disponivel = disponivel;
    vinculo.atualizadoEm = agora;
  } else {
    vinculo = {
      id: crypto.randomUUID(),
      codigo,
      fornecedorId,
      custoUnitario: custoUnitario ?? null,
      disponivel: disponivel ?? true,
      atualizadoEm: agora,
    };
    lista.push(vinculo);
  }
  salvar(CHAVE_VINCULOS, lista);
  pushVinculoUpsert(vinculo);
  return vinculo;
}

/** Marca um item como indisponível (ou disponível de novo) num fornecedor específico — não remove o vínculo, só a flag. */
export function marcarDisponibilidade(codigo, fornecedorId, disponivel) {
  return vincularProdutoFornecedor(codigo, fornecedorId, { disponivel });
}

export function desvincularProdutoFornecedor(codigo, fornecedorId) {
  const lista = ler(CHAVE_VINCULOS, []);
  const vinculo = lista.find((v) => v.codigo === codigo && v.fornecedorId === fornecedorId);
  const restante = lista.filter((v) => !(v.codigo === codigo && v.fornecedorId === fornecedorId));
  salvar(CHAVE_VINCULOS, restante);
  if (vinculo) pushRemoverVinculo(vinculo.id);
}

/** O fornecedor disponível de menor custo pra um produto — usado como sugestão default na tela de alertas/ordem. */
export function getMelhorFornecedor(codigo) {
  const vinculos = listarVinculosPorCodigo(codigo).filter((v) => v.disponivel);
  if (vinculos.length === 0) return null;
  const fornecedores = listarFornecedores();
  const comCusto = vinculos
    .map((v) => ({ vinculo: v, fornecedor: fornecedores.find((f) => f.id === v.fornecedorId) }))
    .filter((x) => x.fornecedor?.ativo);
  if (comCusto.length === 0) return null;
  comCusto.sort((a, b) => (a.vinculo.custoUnitario ?? Infinity) - (b.vinculo.custoUnitario ?? Infinity));
  return comCusto[0];
}

/**
 * Migração única: para todo produto com o campo de texto livre `fornecedor`
 * ainda preenchido em config_produtos (do modelo antigo, pré-cadastro), acha
 * ou cria um fornecedor com esse nome e vincula o produto a ele — sem perder
 * o que já foi digitado. Idempotente (não duplica se já existir vínculo).
 * Retorna um resumo pra exibir na tela.
 */
export function migrarFornecedoresDeTextoLivre(itensDoSnapshot) {
  let fornecedoresCriados = 0;
  let vinculosCriados = 0;
  let ignorados = 0;

  for (const item of itensDoSnapshot) {
    const cfg = getConfigProduto(item.codigo);
    if (!cfg?.fornecedor) continue;
    if (listarVinculosPorCodigo(item.codigo).length > 0) { ignorados += 1; continue; }

    const antesLista = listarFornecedores().length;
    const fornecedor = encontrarOuCriarPorNome(cfg.fornecedor);
    if (listarFornecedores().length > antesLista) fornecedoresCriados += 1;

    vincularProdutoFornecedor(item.codigo, fornecedor.id, { custoUnitario: item.precoCusto ?? null, disponivel: true });
    vinculosCriados += 1;
  }

  return { fornecedoresCriados, vinculosCriados, ignorados };
}
