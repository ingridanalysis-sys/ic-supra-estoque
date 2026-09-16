// Cliente Supabase — `null` quando as variáveis de ambiente não estão
// configuradas, o que mantém o app funcionando 100% em modo local
// (localStorage) sem nenhum erro. Ver README ("Conectando o Supabase").
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && chave ? createClient(url, chave) : null;

export function isSupabaseConfigured() {
  return supabase !== null;
}

/** Quebra um array em lotes — nunca mandar 10 mil linhas num insert só. */
export function chunk(itens, tamanho = 500) {
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Insere um array grande em lotes SEQUENCIAIS (nunca em paralelo — o plano
 * free do Supabase tem limite de conexões simultâneas). Lança se algum lote
 * falhar; quem chama decide se isso é fatal ou só um aviso (ver src/lib/sync/push.js).
 */
export async function insertChunked(tabela, linhas, tamanho = 500) {
  if (!supabase || linhas.length === 0) return;
  for (const lote of chunk(linhas, tamanho)) {
    const { error } = await supabase.from(tabela).insert(lote);
    if (error) throw error;
  }
}
