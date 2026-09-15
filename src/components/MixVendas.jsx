import { useMemo, useState } from 'react';
import { listarMesesImportados } from '../lib/historicoVendas';
import { getTodasConfigs } from '../lib/configProdutos';
import { inferirSetor } from '../lib/setores';
import ImportarVendas from './ImportarVendas';

function fmtMoeda(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      const itensOrdenados = [...itens].sort((a, b) => b.totVendas - a.totVendas);
      return { setor, itens: itensOrdenados, totalSetor };
    });
    grupos.sort((a, b) => b.totalSetor - a.totalSetor);
    return grupos;
  }, [itensDoPeriodo]);

  const maiorSetor = Math.max(1, ...gruposPorSetor.map((g) => g.totalSetor));

  function alternarSetor(setor) {
    setSetoresFechados((s) => {
      const copia = new Set(s);
      if (copia.has(setor)) copia.delete(setor);
      else copia.add(setor);
      return copia;
    });
  }

  return (
    <div>
      <h2>Mix de Vendas</h2>
      <p className="subtitulo-pagina">
        Quanto cada categoria e cada produto representam do faturamento — para enxergar rápido onde focar antes de
        montar o próximo pedido de compra.
      </p>

      <ImportarVendas onGiroAtualizado={() => setVersao((v) => v + 1)} />

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

          <h3 style={{ marginTop: 20, marginBottom: 8 }}>Detalhe por produto, dentro de cada setor</h3>
          {gruposPorSetor.map((g) => {
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
