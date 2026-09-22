// O localStorage tem uma cota por site (geralmente 5-10MB) — com um
// catálogo de ~10 mil produtos e vários meses de vendas item a item, dá pra
// estourar essa cota. Sem esse helper, `localStorage.setItem` lança
// QuotaExceededError sem aviso nenhum na tela: o app continua mostrando os
// dados antigos como se nada tivesse acontecido, o que é muito pior do que
// um erro visível — quem usa o sistema acha que salvou quando não salvou.
//
// Importante: o push pro Supabase (chamado por quem usa este helper, ANTES
// de chamar salvarLocalComFallback) não depende do localStorage — mesmo
// quando o salvamento local aqui falha, os dados já foram enviados pro
// banco. Por isso o aviso deixa isso claro, em vez de soar como perda de dado.

export function salvarLocalComFallback(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (e) {
    console.error(`[armazenamento local] Falha ao salvar "${chave}" — provavelmente estourou a cota do navegador.`, e);
    window.alert(
      'Não foi possível guardar essa atualização no armazenamento local do navegador (ficou grande demais pra caber). ' +
      'Se o Supabase estiver conectado, os dados já foram enviados pra lá normalmente — só essa cópia local não foi ' +
      'atualizada. Recarregue a página (F5) pra puxar a versão certa de volta.'
    );
    return false;
  }
}
