import { useMemo, useState } from 'react';
import { listarMesesImportados } from '../lib/historicoVendas';
import { getTodasConfigs } from '../lib/configProdutos';
import { inferirSetor } from '../lib/setores';
import { gerarRelatorioEscoamentoPdf } from '../lib/relatorioEscoamentoPdf';
import { baixarPdf } from '../lib/ordemCompraPdf';

// Produtos com estoque positivo que não venderam em nenhum dos últimos meses
// importados do Mix de Vendas — candidatos a promoção/liquidação, porque
// estão parados sem giro (não porque estão zerados, que é o caso oposto,
// já tratado em Alertas de Compra).

const QTD_MESES_RECENTES = 3;

const OPCOES_QUANTIDADE = [
  { valor: 10, label: 'Top 10' },
  { valor: 25, label: 'Top 25' },
  { valor: 50, label: 'Top 50' },
  { valor: 100, label: 'Top 100' },
  { valor: 150, label: 'Top 150' },
];

function fmtMoeda(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function EscoamentoEstoque({ itensEstoque }) {
  const [limite, setLimite] = useState(50);
  const [exportando, setExportando] = useState(false);

  // listarMesesImportados() lê o localStorage direto (não é estado React),
  // então precisa ser lido de novo a cada render pra refletir uma
  // importação de vendas nova — sem isso, a tela ficava presa no que
  // existia da primeira vez que montou. A chave abaixo (não a lista em si,
  // que é uma referência nova a cada render) é o que entra na dependência
  // do useMemo pesado logo adiante, pra ele só recalcular quando os MESES
  // realmente mudam, não a cada render.
  const mesesRecentes = listarMesesImportados().slice(-QTD_MESES_RECENTES);
  const chaveMesesRecentes = mesesRecentes.map((m) => m.mesChave).join('|');

  const itensParaEscoamento = useMemo(() => {
    if (mesesRecentes.length === 0) return [];
    const codigosComVenda = new Set();
    for (const mes of mesesRecentes) {
      for (const item of mes.itens) codigosComVenda.add(item.codigo);
    }
    const configs = getTodasConfigs();
    const itens = itensEstoque
      .filter((i) => i.quantidade > 0 && !codigosComVenda.has(i.codigo))
      .map((i) => ({ ...i, setor: configs[i.codigo]?.setor ?? inferirSetor(i.descricao) }));
    itens.sort((a, b) => b.total - a.total);
    return itens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itensEstoque, chaveMesesRecentes]);

  const valorTotalEscoamento = itensParaEscoamento.reduce((s, i) => s + i.total, 0);
  const listaExibida = itensParaEscoamento.slice(0, limite);

  async function exportarPdf() {
    setExportando(true);
    try {
      const logoResp = await fetch('/logo-ic.png');
      const logoBytes = new Uint8Array(await logoResp.arrayBuffer());
      const bytes = await gerarRelatorioEscoamentoPdf({
        itens: itensParaEscoamento, // lista completa, não só o que está exibido na tela
        valorTotal: valorTotalEscoamento,
        mesesConsiderados: mesesRecentes.length,
        logoBytes,
      });
      baixarPdf(bytes, `valor-para-escoamento-ic-supra-${Date.now()}.pdf`);
    } catch (e) {
      console.error(e);
      window.alert('Não foi possível gerar o PDF. Veja o console para detalhes.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="card">
      <h3>Valor para escoamento</h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -4, marginBottom: 14 }}>
        Produtos com estoque positivo que não aparecem em nenhuma venda dos últimos{' '}
        {mesesRecentes.length > 0 ? mesesRecentes.length : QTD_MESES_RECENTES} meses importados do Mix de Vendas —
        sem giro, candidatos a promoção ou liquidação.
      </p>

      {mesesRecentes.length === 0 ? (
        <div className="vazio" style={{ padding: '16px 0' }}>
          Importe pelo menos um mês de vendas na aba <strong>Mix de Vendas</strong> pra calcular isso — sem histórico
          de vendas não dá pra saber o que está sem giro.
        </div>
      ) : (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="kpi-card">
              <div className="kpi-num" style={{ color: 'var(--roxo)' }}>{itensParaEscoamento.length}</div>
              <div className="kpi-lbl">Produtos sem giro</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-num">{fmtMoeda(valorTotalEscoamento)}</div>
              <div className="kpi-lbl">Valor total parado (custo)</div>
            </div>
          </div>

          {itensParaEscoamento.length === 0 ? (
            <div className="vazio" style={{ padding: '10px 0' }}>
              Nenhum produto com estoque positivo ficou fora das vendas recentes — bom sinal, tudo tem giro.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                <select value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
                  {OPCOES_QUANTIDADE.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                </select>
                <button className="btn secundario pequeno" disabled={exportando} onClick={exportarPdf}>
                  {exportando ? 'Gerando PDF…' : `📄 Exportar PDF (${itensParaEscoamento.length})`}
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Setor</th>
                    <th>Estoque</th>
                    <th>Valor (custo)</th>
                  </tr>
                </thead>
                <tbody>
                  {listaExibida.map((item) => (
                    <tr key={item.codigo}>
                      <td>{item.codigo}</td>
                      <td>{item.descricao}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{item.setor}</td>
                      <td>{item.quantidade}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {itensParaEscoamento.length > limite && (
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                  Mostrando {limite} de {itensParaEscoamento.length} produtos sem giro (ordenados por valor parado).
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
