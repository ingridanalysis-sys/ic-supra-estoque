// Configurações manuais por produto: estoque mínimo, giro semanal, lead time
// do fornecedor, fornecedor padrão, e flag de "descontinuado".
// Guardado em localStorage no modo local. A função salvarConfigProduto()
// concentra a escrita para facilitar a troca por chamadas Supabase depois.

const CHAVE = 'ic_supra_config_produtos_v1';

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
  todos[codigo] = { ...todos[codigo], ...config };
  salvarTudo(todos);
  return todos[codigo];
}

export function removerConfigProduto(codigo) {
  const todos = lerTudo();
  delete todos[codigo];
  salvarTudo(todos);
}

export function importarConfigsEmLote(mapaCodigoConfig) {
  const todos = lerTudo();
  for (const [codigo, config] of Object.entries(mapaCodigoConfig)) {
    todos[codigo] = { ...todos[codigo], ...config };
  }
  salvarTudo(todos);
}
