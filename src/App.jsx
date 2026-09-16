import { useMemo, useState } from 'react';
import './App.css';
import ImportarEstoque from './components/ImportarEstoque';
import Dashboard from './components/Dashboard';
import PainelAlertas from './components/PainelAlertas';
import OrdemCompra from './components/OrdemCompra';
import HistoricoPedidos from './components/HistoricoPedidos';
import MixVendas from './components/MixVendas';
import { getUltimoSnapshot } from './lib/historicoPedidos';
import { gerarPainelAlertas } from './lib/alertas';

const ABAS = [
  { chave: 'dashboard', label: 'Visão Geral' },
  { chave: 'importar', label: 'Importar' },
  { chave: 'alertas', label: 'Alertas de Compra' },
  { chave: 'ordem', label: 'Ordem de Compra' },
  { chave: 'mixvendas', label: 'Mix de Vendas' },
  { chave: 'historico', label: 'Histórico' },
];

export default function App() {
  const [aba, setAba] = useState('dashboard');
  const [snapshot, setSnapshot] = useState(() => getUltimoSnapshot());
  const [selecionados, setSelecionados] = useState({}); // { [codigo]: itemComAlerta }

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

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img src="/logo-ic-header.png" alt="IC SupraHospitalar" />
          <span className="titulo">Gestão de Estoque</span>
        </div>
        <span className="badge-modo">○ Modo local — sem persistência entre sessões</span>
      </header>

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
        {aba === 'historico' && <HistoricoPedidos />}
        {aba === 'mixvendas' && <MixVendas />}
      </main>
    </div>
  );
}
