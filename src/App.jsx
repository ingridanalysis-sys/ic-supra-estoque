import { useEffect, useMemo, useState } from 'react';
import './App.css';
import ImportarEstoque from './components/ImportarEstoque';
import Dashboard from './components/Dashboard';
import PainelAlertas from './components/PainelAlertas';
import OrdemCompra from './components/OrdemCompra';
import HistoricoPedidos from './components/HistoricoPedidos';
import MixVendas from './components/MixVendas';
import Fornecedores from './components/Fornecedores';
import TelaLogin from './components/TelaLogin';
import { getUltimoSnapshot } from './lib/historicoPedidos';
import { gerarPainelAlertas } from './lib/alertas';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import { pullTudoDoSupabase } from './lib/sync/pull';

const ABAS = [
  { chave: 'dashboard', label: 'Visão Geral' },
  { chave: 'importar', label: 'Importar' },
  { chave: 'alertas', label: 'Alertas de Compra' },
  { chave: 'ordem', label: 'Ordem de Compra' },
  { chave: 'mixvendas', label: 'Mix de Vendas' },
  { chave: 'historico', label: 'Histórico' },
  { chave: 'fornecedores', label: 'Fornecedores' },
];

export default function App() {
  const [aba, setAba] = useState('dashboard');
  const [snapshot, setSnapshot] = useState(() => getUltimoSnapshot());
  const [selecionados, setSelecionados] = useState({}); // { [codigo]: itemComAlerta }
  // Só existe sincronização quando o Supabase está configurado — sem isso,
  // o app segue 100% em modo local, exatamente como antes.
  const [sincronizando, setSincronizando] = useState(() => isSupabaseConfigured());
  // undefined = ainda checando a sessão salva; null = deslogado; objeto = logado.
  const [usuario, setUsuario] = useState(() => (isSupabaseConfigured() ? undefined : null));
  const [nomeUsuario, setNomeUsuario] = useState(null);

  // Sessão do Supabase Auth — persiste sozinha entre recarregamentos (o
  // client guarda isso no próprio localStorage, chave separada das
  // "ic_supra_*"). onAuthStateChange também dispara em refresh de token em
  // segundo plano, não só login/logout — por isso o efeito de sincronização
  // abaixo depende de usuario?.id (string), nunca do objeto usuario inteiro.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (ativo) setUsuario(data.session?.user ?? null);
    });
    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, session) => {
      setUsuario(session?.user ?? null);
    });
    return () => { ativo = false; assinatura.subscription.unsubscribe(); };
  }, []);

  // Busca o nome do usuário em `perfis` (cai pro e-mail se a linha ainda não
  // existir) — só cosmético, nunca bloqueia nada.
  useEffect(() => {
    if (!isSupabaseConfigured() || !usuario) { setNomeUsuario(null); return; }
    let ativo = true;
    supabase.from('perfis').select('nome').eq('id', usuario.id).maybeSingle()
      .then(({ data }) => { if (ativo) setNomeUsuario(data?.nome ?? usuario.email); })
      .catch(() => { if (ativo) setNomeUsuario(usuario.email); });
    return () => { ativo = false; };
  }, [usuario?.id]);

  // Puxa tudo do Supabase ANTES de liberar a tela — uma escrita local
  // enquanto o pull ainda está em voo poderia ser sobrescrita pela versão
  // (mais antiga) do servidor. Ver src/lib/sync/pull.js. Só roda depois de
  // confirmar login — sem isso, uma visita não-autenticada dispararia pulls
  // que as regras do banco agora recusam.
  useEffect(() => {
    if (!isSupabaseConfigured() || !usuario) return;
    let cancelado = false;
    setSincronizando(true); // cobre o caso de logout → login sem recarregar a página
    pullTudoDoSupabase().finally(() => {
      if (cancelado) return;
      setSnapshot(getUltimoSnapshot());
      setSincronizando(false);
    });
    return () => { cancelado = true; };
  }, [usuario?.id]);

  function handleLogout() {
    supabase.auth.signOut();
    setAba('dashboard');
  }

  const painelAtual = useMemo(() => (snapshot ? gerarPainelAlertas(snapshot.itens) : []), [snapshot]);
  const alertasUrgentes = useMemo(
    () => painelAtual.filter((i) => ['NEGATIVO', 'RUPTURA', 'CRITICO'].includes(i.alerta.nivel)).length,
    [painelAtual]
  );

  function handleSnapshotGerado(novoSnapshot) {
    setSnapshot(novoSnapshot);
    setSelecionados({});
    setAba('alertas');
  }

  function alternarSelecao(item) {
    setSelecionados((s) => {
      const copia = { ...s };
      if (copia[item.codigo]) delete copia[item.codigo];
      else copia[item.codigo] = item;
      return copia;
    });
  }

  function removerSelecao(codigo) {
    setSelecionados((s) => {
      const copia = { ...s };
      delete copia[codigo];
      return copia;
    });
  }

  if (isSupabaseConfigured() && usuario === undefined) {
    return <div className="splash-sync">Carregando…</div>;
  }
  if (isSupabaseConfigured() && usuario === null) {
    return <TelaLogin />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img src="/logo-ic-header.png" alt="IC SupraHospitalar" />
          <span className="titulo">Gestão de Estoque</span>
        </div>
        <div className="topbar-usuario">
          {isSupabaseConfigured() && usuario && (
            <>
              <span className="nome-usuario">{nomeUsuario ?? usuario.email}</span>
              <button className="btn-sair" onClick={handleLogout}>Sair</button>
            </>
          )}
          <span className="badge-modo">
            {isSupabaseConfigured()
              ? (sincronizando ? '↻ Sincronizando com Supabase…' : '● Sincronizado com Supabase')
              : '○ Modo local — sem persistência entre sessões'}
          </span>
        </div>
      </header>

      {sincronizando ? (
        <div className="splash-sync">Sincronizando dados salvos no Supabase…</div>
      ) : (
        <>
          <nav className="tabs">
            {ABAS.map((a) => (
              <button key={a.chave} className={aba === a.chave ? 'active' : ''} onClick={() => setAba(a.chave)}>
                {a.label}
                {a.chave === 'alertas' && alertasUrgentes > 0 && <span className="contagem">{alertasUrgentes}</span>}
                {a.chave === 'ordem' && Object.keys(selecionados).length > 0 && (
                  <span className="contagem">{Object.keys(selecionados).length}</span>
                )}
              </button>
            ))}
          </nav>

          <main className="conteudo">
            {aba === 'dashboard' && <Dashboard snapshot={snapshot} />}
            {aba === 'importar' && <ImportarEstoque onSnapshotGerado={handleSnapshotGerado} />}
            {aba === 'alertas' && (
              <PainelAlertas
                snapshot={snapshot}
                selecionados={selecionados}
                onAlternarSelecao={alternarSelecao}
                onIrParaOrdem={() => setAba('ordem')}
              />
            )}
            {aba === 'ordem' && (
              <OrdemCompra
                selecionados={selecionados}
                onRemoverSelecao={removerSelecao}
                onPedidoCriado={() => setSelecionados({})}
              />
            )}
            {aba === 'historico' && <HistoricoPedidos snapshot={snapshot} />}
            {aba === 'mixvendas' && <MixVendas />}
            {aba === 'fornecedores' && <Fornecedores />}
          </main>
        </>
      )}
    </div>
  );
}
