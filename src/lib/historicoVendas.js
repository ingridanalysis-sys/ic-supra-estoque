// Guarda cada mês de vendas importado, indexado pela chave do mês
// ("2026-06"). Reimportar o mesmo mês SOBRESCREVE (o chamador deve
// confirmar com o usuário antes — ver ImportarVendas.jsx), nunca duplica.

const CHAVE = 'ic_supra_vendas_mensais_v1';

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
  return registro;
}

export function removerVendasMes(mesChave) {
  const todos = ler();
  delete todos[mesChave];
  salvar(todos);
}

/**
 * Lista os meses importados, ordenados cronologicamente (mais antigo primeiro).
 */
export function listarMesesImportados() {
  const todos = ler();
  return Object.values(todos).sort((a, b) => (a.mesChave < b.mesChave ? -1 : 1));
}
