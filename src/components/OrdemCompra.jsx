import { useMemo, useState } from 'react';
import { gerarOrdemCompraPdf, baixarPdf } from '../lib/ordemCompraPdf';
import { criarPedido } from '../lib/historicoPedidos';
import { getConfigProduto, salvarConfigProduto } from '../lib/configProdutos';

export default function OrdemCompra({ selecionados, onRemoverSelecao, onPedidoCriado }) {
  const itens = Object.values(selecionados);
  const [campos, setCampos] = useState(() => {
    const iniciais = {};
    for (const item of itens) {
      const cfg = getConfigProduto(item.codigo);
      iniciais[item.codigo] = {
        qtd: sugerirQuantidade(item),
        fornecedor: cfg?.fornecedor ?? '',
        custoUnit: item.precoCusto ?? 0,
      };
    }
    return iniciais;
  });
  const [gerando, setGerando] = useState(false);
  const [observacoes, setObservacoes] = useState('');

  function sugerirQuantidade(item) {
    if (item.alerta?.nivel === 'NEGATIVO') return Math.abs(item.quantidade);
    if (item.alerta?.diasCobertura != null && item.alerta.diasCobertura < 0) return 1;
    return 1; // ponto de partida — o usuário ajusta
  }

  function atualizarCampo(codigo, campo, valor) {
    setCampos((c) => ({ ...c, [codigo]: { ...c[codigo], [campo]: valor } }));
  }

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const item of itens) {
      const c = campos[item.codigo] ?? {};
      const fornecedor = c.fornecedor?.trim() || 'A definir';
      if (!mapa.has(fornecedor)) mapa.set(fornecedor, []);
      mapa.get(fornecedor).push({
        codigo: item.codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        qtd: Number(c.qtd) || 0,
        custoUnit: Number(c.custoUnit) || 0,
        nivel: item.alerta?.nivel,
      });
    }
    return Array.from(mapa.entries()).map(([fornecedor, itensGrupo]) => ({ fornecedor, itens: itensGrupo }));
  }, [itens, campos]);

  const valorTotal = grupos.reduce(
    (s, g) => s + g.itens.reduce((s2, i) => s2 + i.qtd * i.custoUnit, 0),
    0
  );

  async function handleGerarPdf() {
    setGerando(true);
    try {
      // salva o fornecedor escolhido como preferência futura do produto
      for (const item of itens) {
        const fornecedor = campos[item.codigo]?.fornecedor;
        if (fornecedor) salvarConfigProduto(item.codigo, { fornecedor });
      }

      const logoResp = await fetch('/logo-ic.png');
      const logoBytes = new Uint8Array(await logoResp.arrayBuffer());

      const bytes = await gerarOrdemCompraPdf({
        grupos,
        referencia: `Ordem de compra — ${new Date().toLocaleDateString('pt-BR')}`,
        logoBytes,
        observacoes: observacoes.trim() || null,
      });
      baixarPdf(bytes, `ordem-de-compra-ic-supra-${Date.now()}.pdf`);

      // registra no histórico, um pedido por fornecedor (a observação vale
      // pra ordem inteira, então fica salva em cada pedido gerado por ela)
      for (const grupo of grupos) {
        const pedido = criarPedido({
          fornecedor: grupo.fornecedor,
          itens: grupo.itens.map((i) => ({
            codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, qtdPedida: i.qtd, custoUnit: i.custoUnit,
          })),
          observacoes: observacoes.trim() || null,
        });
        onPedidoCriado?.(pedido);
      }
    } catch (e) {
      console.error(e);
      alert('Não foi possível gerar o PDF. Veja o console para detalhes.');
    } finally {
      setGerando(false);
    }
  }

  if (itens.length === 0) {
    return (
      <div className="vazio">
        Nenhum item selecionado. Vá para <strong>Alertas de Compra</strong> e marque os produtos que deseja incluir.
      </div>
    );
  }

  return (
    <div>
      <h2>Montar ordem de compra</h2>
      <p className="subtitulo-pagina">
        Ajuste quantidade, custo e fornecedor de cada item. O PDF final é segmentado por fornecedor.
      </p>

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Descrição</th>
            <th>Qtd.</th>
            <th>Custo Un. (R$)</th>
            <th>Fornecedor</th>
            <th>Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const c = campos[item.codigo] ?? {};
            const subtotal = (Number(c.qtd) || 0) * (Number(c.custoUnit) || 0);
            return (
              <tr key={item.codigo}>
                <td>{item.codigo}</td>
                <td>{item.descricao}</td>
                <td>
                  <input type="number" min="0" value={c.qtd} style={{ width: 70 }}
                    onChange={(e) => atualizarCampo(item.codigo, 'qtd', e.target.value)} />
                </td>
                <td>
                  <input type="number" min="0" step="0.01" value={c.custoUnit} style={{ width: 90 }}
                    onChange={(e) => atualizarCampo(item.codigo, 'custoUnit', e.target.value)} />
                </td>
                <td>
                  <input type="text" placeholder="Nome do fornecedor" value={c.fornecedor} style={{ width: 160 }}
                    onChange={(e) => atualizarCampo(item.codigo, 'fornecedor', e.target.value)} />
                </td>
                <td>R$ {subtotal.toFixed(2).replace('.', ',')}</td>
                <td>
                  <button className="btn secundario pequeno" onClick={() => onRemoverSelecao(item.codigo)}>Remover</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Resumo por fornecedor</h3>
        {grupos.map((g) => (
          <div key={g.fornecedor} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
            <span>{g.fornecedor} ({g.itens.length} item(ns))</span>
            <strong>R$ {g.itens.reduce((s, i) => s + i.qtd * i.custoUnit, 0).toFixed(2).replace('.', ',')}</strong>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--cinza-borda)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--azul)' }}>
          <span>Total geral</span>
          <span>R$ {valorTotal.toFixed(2).replace('.', ',')}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Observações</h3>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Descrição livre — combinação com o fornecedor, urgência, prazo de entrega, etc. Entra no PDF e fica salva no histórico do pedido."
          rows={3}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div className="rodape-acoes">
        <button className="btn" disabled={gerando} onClick={handleGerarPdf}>
          {gerando ? 'Gerando PDF…' : '📄 Gerar PDF da ordem de compra'}
        </button>
      </div>
    </div>
  );
}
