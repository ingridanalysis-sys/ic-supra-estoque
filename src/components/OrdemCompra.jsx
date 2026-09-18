import { useMemo, useState } from 'react';
import { gerarOrdemCompraPdf, baixarPdf } from '../lib/ordemCompraPdf';
import { criarPedido } from '../lib/historicoPedidos';
import { getConfigProduto, salvarConfigProduto } from '../lib/configProdutos';
import { listarVinculos, listarFornecedores, marcarDisponibilidade } from '../lib/fornecedores';

const MANUAL = '__manual__';

/** Fornecedores cadastrados, disponíveis e ativos pra um código, ordenados do mais barato pro mais caro. */
function opcoesFornecedor(codigo, vinculos, fornecedores) {
  return vinculos
    .filter((v) => v.codigo === codigo && v.disponivel)
    .map((v) => ({ vinculo: v, fornecedor: fornecedores.find((f) => f.id === v.fornecedorId) }))
    .filter((x) => x.fornecedor?.ativo)
    .sort((a, b) => (a.vinculo.custoUnitario ?? Infinity) - (b.vinculo.custoUnitario ?? Infinity));
}

export default function OrdemCompra({ selecionados, onRemoverSelecao, onPedidoCriado }) {
  const itens = Object.values(selecionados);
  const [vinculos, setVinculos] = useState(() => listarVinculos());
  const [fornecedores] = useState(() => listarFornecedores());
  const [campos, setCampos] = useState(() => {
    const iniciais = {};
    for (const item of itens) {
      const cfg = getConfigProduto(item.codigo);
      const melhor = opcoesFornecedor(item.codigo, vinculos, fornecedores)[0];
      iniciais[item.codigo] = {
        qtd: item.alerta?.quantidadeSugerida ?? 1,
        fornecedorId: melhor?.fornecedor.id ?? null,
        fornecedorTexto: melhor ? '' : (cfg?.fornecedor ?? ''),
        custoUnit: melhor ? (melhor.vinculo.custoUnitario ?? item.precoCusto ?? 0) : (item.precoCusto ?? 0),
      };
    }
    return iniciais;
  });
  const [gerando, setGerando] = useState(false);
  const [observacoes, setObservacoes] = useState('');

  function atualizarCampo(codigo, campo, valor) {
    setCampos((c) => ({ ...c, [codigo]: { ...c[codigo], [campo]: valor } }));
  }

  /**
   * "Esse fornecedor não tem esse item" — marca o vínculo como indisponível
   * (fica registrado no cadastro, não sugere mais esse par de novo) e
   * reatribui o item pro próximo fornecedor cadastrado mais barato, se
   * houver. Não afeta os outros itens do mesmo fornecedor — o resto do
   * pedido dele segue normalmente, é só esse item que muda de grupo.
   */
  function marcarItemIndisponivel(codigo, fornecedorId) {
    marcarDisponibilidade(codigo, fornecedorId, false);
    const vinculosAtualizados = listarVinculos();
    setVinculos(vinculosAtualizados);
    const proximo = opcoesFornecedor(codigo, vinculosAtualizados, fornecedores)[0];
    setCampos((c) => ({
      ...c,
      [codigo]: {
        ...c[codigo],
        fornecedorId: proximo?.fornecedor.id ?? null,
        custoUnit: proximo ? (proximo.vinculo.custoUnitario ?? c[codigo].custoUnit) : c[codigo].custoUnit,
      },
    }));
    window.alert(
      proximo
        ? `Marcado como indisponível. Reatribuído para "${proximo.fornecedor.nome}" (o resto do pedido anterior não é afetado).`
        : 'Marcado como indisponível. Não há outro fornecedor cadastrado pra esse item — ficará em "A definir" até cadastrar um novo, na aba Fornecedores.'
    );
  }

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const item of itens) {
      const c = campos[item.codigo] ?? {};
      const fornecedorCadastrado = c.fornecedorId ? fornecedores.find((f) => f.id === c.fornecedorId) : null;
      const nomeFornecedor = fornecedorCadastrado?.nome ?? (c.fornecedorTexto?.trim() || 'A definir');
      if (!mapa.has(nomeFornecedor)) mapa.set(nomeFornecedor, { itens: [], fornecedorCadastrado });
      mapa.get(nomeFornecedor).itens.push({
        codigo: item.codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        qtd: Number(c.qtd) || 0,
        custoUnit: Number(c.custoUnit) || 0,
        nivel: item.alerta?.nivel,
      });
    }
    return Array.from(mapa.entries()).map(([fornecedor, dados]) => ({ fornecedor, ...dados }));
  }, [itens, campos, fornecedores]);

  const valorTotal = grupos.reduce(
    (s, g) => s + g.itens.reduce((s2, i) => s2 + i.qtd * i.custoUnit, 0),
    0
  );

  async function handleGerarPdf() {
    setGerando(true);
    try {
      // Quando o fornecedor foi digitado à mão (ainda não cadastrado na aba
      // Fornecedores), guarda como preferência futura do produto — se já veio
      // do cadastro, o cadastro em si já é a fonte da verdade, não precisa duplicar.
      for (const item of itens) {
        const c = campos[item.codigo];
        if (!c?.fornecedorId && c?.fornecedorTexto?.trim()) {
          salvarConfigProduto(item.codigo, { fornecedor: c.fornecedorTexto.trim() });
        }
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
            const opcoes = opcoesFornecedor(item.codigo, vinculos, fornecedores);
            const usandoManual = !c.fornecedorId;
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
                  <select
                    value={usandoManual ? MANUAL : c.fornecedorId}
                    style={{ width: 170 }}
                    onChange={(e) => {
                      if (e.target.value === MANUAL) {
                        atualizarCampo(item.codigo, 'fornecedorId', null);
                      } else {
                        const escolhido = opcoes.find((o) => o.fornecedor.id === e.target.value);
                        setCampos((cc) => ({
                          ...cc,
                          [item.codigo]: {
                            ...cc[item.codigo],
                            fornecedorId: e.target.value,
                            custoUnit: escolhido?.vinculo.custoUnitario ?? cc[item.codigo].custoUnit,
                          },
                        }));
                      }
                    }}
                  >
                    {opcoes.map((o) => (
                      <option key={o.fornecedor.id} value={o.fornecedor.id}>
                        {o.fornecedor.nome} {o.vinculo.custoUnitario != null ? `(R$ ${o.vinculo.custoUnitario})` : ''}
                      </option>
                    ))}
                    <option value={MANUAL}>Outro (digitar)…</option>
                  </select>
                  {usandoManual && (
                    <input
                      type="text"
                      placeholder="Nome do fornecedor"
                      value={c.fornecedorTexto ?? ''}
                      style={{ width: 170, marginTop: 4 }}
                      onChange={(e) => atualizarCampo(item.codigo, 'fornecedorTexto', e.target.value)}
                    />
                  )}
                  {!usandoManual && (
                    <button
                      className="btn secundario pequeno"
                      style={{ marginTop: 4 }}
                      title="Esse fornecedor não tem esse item — reatribui pro próximo disponível, sem afetar o resto do pedido dele"
                      onClick={() => marcarItemIndisponivel(item.codigo, c.fornecedorId)}
                    >
                      Indisponível aqui
                    </button>
                  )}
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
