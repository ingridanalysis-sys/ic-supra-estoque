// Configurações manuais por produto: estoque mínimo, giro semanal, lead time
// do fornecedor, fornecedor padrão, e flag de "descontinuado".
// Guardado em localStorage — e, quando o Supabase estiver configurado,
// também empurrado pra lá em segundo plano (ver src/lib/sync/push.js) e
// puxado de lá no início da sessão (ver src/lib/sync/pull.js).

import { pushConfigProduto, pushRemoverConfigProduto, pushConfigsEmLote } from './sync/push';

export const CHAVE_CONFIG_PRODUTOS = 'ic_supra_config_produtos_v1';
const CHAVE = CHAVE_CONFIG_PRODUTOS;

function lerTudo() {
  try {
    const raw = localStorage.getItem(CHAVE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function salvarTudo(obj) {
  localStorage.setItem(CHAVE, JSON.stringify(obj));
}

export function getConfigProduto(codigo) {
  const todos = lerTudo();
  return todos[codigo] ?? null;
}

export function getTodasConfigs() {
  return lerTudo();
}

export function salvarConfigProduto(codigo, config) {
  const todos = lerTudo();
  todos[codigo] = { ...todos[codigo], ...config, atualizadoEm: new Date().toISOString() };
  salvarTudo(todos);
  pushConfigProduto(codigo, todos[codigo]);
  return todos[codigo];
}

export function removerConfigProduto(codigo) {
  const todos = lerTudo();
  delete todos[codigo];
  salvarTudo(todos);
  pushRemoverConfigProduto(codigo);
}

export function importarConfigsEmLote(mapaCodigoConfig) {
  const todos = lerTudo();
  const agora = new Date().toISOString();
  for (const [codigo, config] of Object.entries(mapaCodigoConfig)) {
    todos[codigo] = { ...todos[codigo], ...config, atualizadoEm: agora };
  }
  salvarTudo(todos);
  pushConfigsEmLote(mapaCodigoConfig, todos);
}
