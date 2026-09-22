import { useMemo, useState } from 'react';
import { listarMesesImportados } from '../lib/historicoVendas';
import { getTodasConfigs } from '../lib/configProdutos';
import { inferirSetor } from '../lib/setores';
import { aplicarGiroAutomatico, aplicarMinimoAutomatico } from '../lib/giroAutomatico';
import ImportarVendas from './ImportarVendas';

function fmtMoeda(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const OPCOES_ORDENACAO = [
  { valor: 'FATURAMENTO_DESC', label: 'Faturamento (maior → menor)' },
  { valor: 'FATURAMENTO_ASC', label: 'Faturamento (menor → maior)' },
  { valor: 'QUANTIDADE_DESC', label: 'Quantidade (maior → menor)' },
  { valor: 'QUANTIDADE_ASC', label: 'Quantidade (menor → maior)' },
];

function ordenarItens(itens, ordenacao) {
  const ordenados = [...itens];
  switch (ordenacao) {
    case 'FATURAMENTO_ASC': return ordenados.sort((a, b) => a.totVendas - b.totVendas);
    case 'QUANTIDADE_DESC': return ordenados.sort((a, b) => b.qtdeVolumes - a.qtdeVolumes);
    case 'QUANTIDADE_ASC': return ordenados.sort((a, b) => a.qtdeVolumes - b.qtdeVolumes);
    case 'FATURAMENTO_DESC':
    default:
      return ordenados.sort((a, b) => b.totVendas - a.totVendas);
  }
}

function StatCard({ label, valor, sub, cor }) {
  return (
    <div className="kpi-card">
      <div className="kpi-num" style={cor ? { color: cor } : undefined}>{valor}</div>
      <div className="kpi-lbl">{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Barra horizontal de participação, no estilo do "Mix de Vendas" do Fruta Polpa. */
function BarraMix({ valor, maximo, cor = 'var(--azul)' }) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0;
  return (
    <div style={{ background: 'var(--cinza-borda)', borderRadius: 4, height: 9, width: '100%', minWidth: 90 }}>
      <div style={{ background: cor, borderRadius: 4, height: 9, width: `${pct}%` }} />
    </div>
  );
}

export default function MixVendas() {
  const [versao, setVersao] = useState(0);
  const meses = useMemo(() => listarMesesImportados(), [versao]);
  const [mesSelecionado, setMesSelecionado] = useState('ACUMULADO');
  const [filtroSetor, setFiltroSetor] = useState('TODOS');
  const [ordenacao, setOrdenacao] = useState('FATURAMENTO_DESC');
  const [setoresFechados, setSetoresFechados] = useState(() => new Set());

  // itens do período selecionado, já com o valor somado por produto quando
  // "Acumulado" combina vários meses (mesmo código pode vender em mais de um mês)
  const itensDoPeriodo = useMemo(() => {
    const relevantes = mesSelecionado === 'ACUMULADO'
      ? meses
      : meses.filter((m) => m.mesChave === mesSelecionado);

    const porCodigo = new Map();
    for (const mes of relevantes) {
      for (const item of mes.itens) {
        const atual = porCodigo.get(item.codigo);
        if (atual) {
          atual.qtdeNotas += item.qtdeNotas;
          atual.qtdeVolumes += item.qtdeVolumes;
          atual.totComissoes += item.totComissoes;
          atual.totVendas += item.totVendas;
        } else {
          porCodigo.set(item.codigo, { ...item });
        }
      }
    }
    return Array.from(porCodigo.values());
  }, [meses, mesSelecionado]);

  const resumoPeriodo = useMemo(() => {
    const totalVendas = itensDoPeriodo.reduce((s, i) => s + i.totVendas, 0);
    const totalVolumes = itensDoPeriodo.reduce((s, i) => s + i.qtdeVolumes, 0);
    const totalNotas = itensDoPeriodo.reduce((s, i) => s + i.qtdeNotas, 0);
    return {
      totalVendas,
      totalVolumes,
      totalNotas,
      produtosDistintos: itensDoPeriodo.length,
      ticketMedio: totalNotas > 0 ? totalVendas / totalNotas : 0,
    };
  }, [itensDoPeriodo]);

  // agrupa por setor (config manual > inferência por descrição)
  const gruposPorSetor = useMemo(() => {
    const configs = getTodasConfigs();
    const mapa = new Map();
    for (const item of itensDoPeriodo) {
      const setor = configs[item.codigo]?.setor ?? inferirSetor(item.descricao);
      if (!mapa.has(setor)) mapa.set(setor, []);
      mapa.get(setor).push(item);
    }
    const grupos = Array.from(mapa.entries()).map(([setor, itens]) => {
      const totalSetor = itens.reduce((s, i) => s + i.totVendas, 0);
      return { setor, itens: ordenarItens(itens, ordenacao), totalSetor };
    });
    grupos.sort((a, b) => b.totalSetor - a.totalSetor);
    return grupos;
  }, [itensDoPeriodo, ordenacao]);

  const maiorSetor = Math.max(1, ...gruposPorSetor.map((g) => g.totalSetor));

  // isola um único setor no detalhamento por produto, sem afetar a tabela
  // de participação geral acima (essa continua mostrando todos)
  const gruposParaDetalhe = useMemo(
    () => (filtroSetor === 'TODOS' ? gruposPorSetor : gruposPorSetor.filter((g) => g.setor === filtroSetor)),
    [gruposPorSetor, filtroSetor]
  );

  function expandirTodos() { setSetoresFechados(new Set()); }
  function retrairTodos() { setSetoresFechados(new Set(gruposParaDetalhe.map((g) => g.setor))); }

  function alternarSetor(setor) {
    setSetoresFechados((s) => {
      const copia = new Set(s);
      if (copia.has(setor)) copia.delete(setor);
      else copia.add(setor);
      return copia;
    });
  }

  function handleRecalcular() {
    const giro = aplicarGiroAutomatico();
    const minimo = aplicarMinimoAutomatico();
    setVersao((v) => v + 1);
    window.alert(
      `Giro semanal recalculado para ${giro.atualizados} produto(s)` +
      (giro.ignoradosManual > 0 ? ` (${giro.ignoradosManual} mantiveram ajuste manual)` : '') +
      `.\nEstoque mínimo e ponto de pedido recalculados para ${minimo.atualizados} produto(s)` +
      (minimo.ignoradosManual > 0 ? ` (${minimo.ignoradosManual} mantiveram ajuste manual)` : '') +
      (minimo.semGiro > 0 ? `.\n${minimo.semGiro} produto(s) sem giro conhecido continuam sem mínimo automático (sem venda registrada ainda pra calcular).` : '.')
    );
  }

  return (
    <div>
      <h2>Mix de Vendas</h2>
      <p className="subtitulo-pagina">
        Quanto cada categoria e cada produto representam do faturamento — para enxergar rápido onde focar antes de
        montar o próximo pedido de compra.
      </p>

      <ImportarVendas onGiroAtualizado={() => setVersao((v) => v + 1)} />

      {meses.length > 0 && (
        <div style={{ margin: '10px 0 16px' }}>
          <button className="btn secundario pequeno" onClick={handleRecalcular}>
            🔄 Recalcular giro, mínimo e ponto de pedido de todo o catálogo agora
          </button>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
            Útil pra aplicar retroativamente aos meses já importados antes dessa conta existir — não precisa reimportar nenhum PDF.
          </p>
        </div>
      )}

      {meses.length === 0 ? (
        <div className="vazio">Nenhum mês de vendas importado ainda — use o card acima.</div>
      ) : (
        <>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0' }}>
            Período:
            <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)}>
              <option value="ACUMULADO">Acumulado ({meses.length} {meses.length === 1 ? 'mês' : 'meses'})</option>
              {meses.map((m) => <option key={m.mesChave} value={m.mesChave}>{m.mesLabel}</option>)}
            </select>
          </label>

          <div className="kpi-grid">
            <StatCard label="Faturamento" valor={fmtMoeda(resumoPeriodo.totalVendas)} />
            <StatCard label="Ticket médio" valor={fmtMoeda(resumoPeriodo.ticketMedio)} sub="faturamento ÷ notas" />
            <StatCard label="Volumes vendidos" valor={resumoPeriodo.totalVolumes.toLocaleString('pt-BR')} cor="var(--verde)" />
            <StatCard label="Produtos distintos" valor={resumoPeriodo.produtosDistintos} cor="var(--roxo)" />
          </div>

          <div className="card">
            <h3>Participação por setor</h3>
            <table>
              <thead>
                <tr><th>Setor</th><th>Faturamento</th><th>% Participação</th><th>Mix</th></tr>
              </thead>
              <tbody>
                {gruposPorSetor.map((g) => (
                  <tr key={g.setor}>
                    <td>{g.setor}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(g.totalSetor)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{((g.totalSetor / (resumoPeriodo.totalVendas || 1)) * 100).toFixed(1)}%</td>
                    <td style={{ minWidth: 140 }}><BarraMix valor={g.totalSetor} maximo={maiorSetor} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 20, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Detalhe por produto, dentro de cada setor</h3>
            <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)} style={{ marginLeft: 'auto' }}>
              <option value="TODOS">Todos os setores</option>
              {gruposPorSetor.map((g) => <option key={g.setor} value={g.setor}>{g.setor}</option>)}
            </select>
            <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value)}>
              {OPCOES_ORDENACAO.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
            </select>
            <button className="btn secundario pequeno" onClick={expandirTodos}>Expandir todos</button>
            <button className="btn secundario pequeno" onClick={retrairTodos}>Retrair todos</button>
          </div>

          {gruposParaDetalhe.length === 0 && <div className="vazio">Nenhum produto nesse setor, no período selecionado.</div>}

          {gruposParaDetalhe.map((g) => {
            const aberto = !setoresFechados.has(g.setor);
            const maiorProduto = Math.max(1, ...g.itens.map((i) => i.totVendas));
            return (
              <div className="setor-bloco" key={g.setor}>
                <div className="setor-header" onClick={() => alternarSetor(g.setor)}>
                  <span className={`seta ${aberto ? 'aberto' : ''}`}>▶</span>
                  {g.setor}
                  <span className="contagem-setor">
                    {g.itens.length} produto(s) · {fmtMoeda(g.totalSetor)} · {((g.totalSetor / (resumoPeriodo.totalVendas || 1)) * 100).toFixed(1)}%
                  </span>
                </div>
                {aberto && (
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Qtd.</th>
                        <th>Faturamento</th>
                        <th>Preço Médio</th>
                        <th>% Participação</th>
                        <th>Mix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.itens.map((item) => (
                        <tr key={item.codigo}>
                          <td>{item.descricao}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{item.qtdeVolumes.toLocaleString('pt-BR')}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(item.totVendas)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(item.totVendas / (item.qtdeVolumes || 1))}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{((item.totVendas / (resumoPeriodo.totalVendas || 1)) * 100).toFixed(2)}%</td>
                          <td style={{ minWidth: 140 }}><BarraMix valor={item.totVendas} maximo={maiorProduto} cor="var(--verde)" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
