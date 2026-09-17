import { useMemo, useState } from 'react';
import {
  listarPedidos,
  registrarRecebimento,
  cancelarPedido,
  editarPedido,
} from '../lib/historicoPedidos';

const STATUS_COR = {
  pendente: { cor: 'var(--amarelo)', fundo: 'var(--amarelo-claro)', label: 'Pendente' },
  parcial: { cor: 'var(--azul)', fundo: 'var(--azul-claro)', label: 'Parcial' },
  recebido: { cor: 'var(--verde)', fundo: 'var(--verde-claro)', label: 'Recebido' },
  cancelado: { cor: 'var(--muted)', fundo: 'var(--cinza)', label: 'Cancelado' },
};

const FILTROS_STATUS = [
  { chave: 'TODOS', label: 'Todos' },
  { chave: 'pendente', label: 'Pendente' },
  { chave: 'parcial', label: 'Parcial' },
  { chave: 'recebido', label: 'Recebido' },
  { chave: 'cancelado', label: 'Cancelado' },
];

/** Formulário de edição de um pedido — troca a tabela somente-leitura por
 * campos editáveis, com busca no catálogo pra adicionar item esquecido. */
function EdicaoPedido({ pedido, snapshot, onSalvar, onCancelar }) {
  const [fornecedor, setFornecedor] = useState(pedido.fornecedor);
  const [itens, setItens] = useState(() => pedido.itens.map((i) => ({ ...i })));
  const [busca, setBusca] = useState('');

  const codigosJaNoPedido = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens]);

  const resultadosBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo.length < 2 || !snapshot) return [];
    return snapshot.itens
      .filter((i) => !codigosJaNoPedido.has(i.codigo) && (
        i.codigo.includes(termo) || i.descricao.toLowerCase().includes(termo)
      ))
      .slice(0, 8);
  }, [busca, snapshot, codigosJaNoPedido]);

  function atualizarItem(codigo, campo, valor) {
    setItens((atual) => atual.map((i) => (i.codigo === codigo ? { ...i, [campo]: Number(valor) || 0 } : i)));
  }

  function removerItem(codigo) {
    setItens((atual) => atual.filter((i) => i.codigo !== codigo));
  }

  function adicionarItem(itemCatalogo) {
    setItens((atual) => [...atual, {
      codigo: itemCatalogo.codigo,
      descricao: itemCatalogo.descricao,
      unidade: itemCatalogo.unidade || '-',
      qtdPedida: 1,
      qtdRecebida: 0,
      custoUnit: itemCatalogo.precoCusto || 0,
    }]);
    setBusca('');
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
        Fornecedor{' '}
        <input type="text" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} style={{ width: 220 }} />
      </label>

      <table>
        <thead>
          <tr><th>Código</th><th>Descrição</th><th>Qtd. pedida</th><th>Custo Un.</th><th>Recebido</th><th></th></tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.codigo}>
              <td>{item.codigo}</td>
              <td>{item.descricao}</td>
              <td>
                <input type="number" min="0" value={item.qtdPedida} style={{ width: 70 }}
                  onChange={(e) => atualizarItem(item.codigo, 'qtdPedida', e.target.value)} />
              </td>
              <td>
                <input type="number" min="0" step="0.01" value={item.custoUnit} style={{ width: 80 }}
                  onChange={(e) => atualizarItem(item.codigo, 'custoUnit', e.target.value)} />
              </td>
              <td>{item.qtdRecebida ?? 0}</td>
              <td>
                <button className="btn secundario pequeno" onClick={() => removerItem(item.codigo)}>Remover</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 10, position: 'relative' }}>
        <input
          type="text"
          placeholder="Adicionar item esquecido — busque por código ou descrição…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ width: '100%' }}
        />
        {resultadosBusca.length > 0 && (
          <div className="card" style={{ position: 'absolute', zIndex: 5, width: '100%', marginTop: 4, padding: 6, maxHeight: 220, overflowY: 'auto' }}>
            {resultadosBusca.map((r) => (
              <div
                key={r.codigo}
                onClick={() => adicionarItem(r)}
                style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--cinza)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <strong>{r.codigo}</strong> — {r.descricao}
              </div>
            ))}
          </div>
        )}
        {busca.trim().length >= 2 && resultadosBusca.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Nenhum produto encontrado.</div>
        )}
        {!snapshot && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Sem estoque importado nesta sessão pra buscar — dá pra editar quantidade/custo dos itens já existentes mesmo assim.
          </div>
        )}
      </div>

      <div className="linha-flex" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn secundario pequeno" onClick={onCancelar}>Cancelar edição</button>
        <button
          className="btn pequeno"
          disabled={itens.length === 0}
          onClick={() => onSalvar({ fornecedor, itens })}
        >
          Salvar edição
        </button>
      </div>
    </div>
  );
}

export default function HistoricoPedidos({ snapshot }) {
  const [pedidos, setPedidos] = useState(listarPedidos());
  const [aberto, setAberto] = useState(null);
  const [editando, setEditando] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('TODOS');

  function recarregar() {
    setPedidos(listarPedidos());
  }

  function handleReceber(pedidoId, codigo, qtdPedida, qtdJaRecebida) {
    const restante = qtdPedida - qtdJaRecebida;
    const valor = window.prompt(`Quantidade recebida agora (restam ${restante}):`, restante);
    const num = Number(valor);
    if (!num || num <= 0) return;
    registrarRecebimento(pedidoId, codigo, num);
    recarregar();
  }

  function handleCancelar(pedidoId) {
    const motivo = window.prompt('Motivo do cancelamento (obrigatório):');
    if (!motivo || !motivo.trim()) return; // sem motivo, não cancela
    cancelarPedido(pedidoId, motivo.trim());
    recarregar();
  }

  function handleSalvarEdicao(pedidoId, dados) {
    editarPedido(pedidoId, dados);
    setEditando(null);
    recarregar();
  }

  const contagensStatus = useMemo(() => {
    const c = { pendente: 0, parcial: 0, recebido: 0, cancelado: 0 };
    for (const p of pedidos) if (c[p.status] !== undefined) c[p.status] += 1;
    return c;
  }, [pedidos]);

  const pedidosFiltrados = filtroStatus === 'TODOS' ? pedidos : pedidos.filter((p) => p.status === filtroStatus);

  if (pedidos.length === 0) {
    return <div className="vazio">Nenhum pedido de compra registrado ainda.</div>;
  }

  return (
    <div>
      <h2>Histórico de pedidos</h2>
      <p className="subtitulo-pagina">
        Todos os pedidos gerados pelo sistema, com status de recebimento. Pedidos cancelados continuam
        aqui — nada é apagado, só marcado.
      </p>

      <div className="filtros">
        {FILTROS_STATUS.map((f) => (
          <button key={f.chave} className={filtroStatus === f.chave ? 'active' : ''} onClick={() => setFiltroStatus(f.chave)}>
            {f.label} {f.chave !== 'TODOS' && contagensStatus[f.chave] ? `(${contagensStatus[f.chave]})` : ''}
          </button>
        ))}
      </div>

      {pedidosFiltrados.length === 0 && <div className="vazio">Nenhum pedido nesse filtro.</div>}

      {pedidosFiltrados.map((pedido) => {
        const s = STATUS_COR[pedido.status] ?? STATUS_COR.pendente;
        const totalPedido = pedido.itens.reduce((s2, i) => s2 + i.qtdPedida * i.custoUnit, 0);
        const emEdicao = editando === pedido.id;
        return (
          <div className="card" key={pedido.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{pedido.fornecedor}</strong>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {new Date(pedido.criadoEm).toLocaleString('pt-BR')} · {pedido.itens.length} item(ns) · R$ {totalPedido.toFixed(2).replace('.', ',')}
                </div>
              </div>
              <div className="linha-flex">
                <span className="tag" style={{ color: s.cor, background: s.fundo }}>{s.label}</span>
                {pedido.status !== 'cancelado' && (
                  <button
                    className="btn secundario pequeno"
                    onClick={() => { setEditando(emEdicao ? null : pedido.id); setAberto(pedido.id); }}
                  >
                    {emEdicao ? 'Fechar edição' : 'Editar'}
                  </button>
                )}
                {pedido.status !== 'cancelado' && (
                  <button className="btn secundario pequeno" onClick={() => handleCancelar(pedido.id)}>
                    Cancelar pedido
                  </button>
                )}
                <button
                  className="btn secundario pequeno"
                  onClick={() => { setAberto(aberto === pedido.id ? null : pedido.id); setEditando(null); }}
                >
                  {aberto === pedido.id && !emEdicao ? 'Fechar' : 'Detalhes'}
                </button>
              </div>
            </div>

            {aberto === pedido.id && pedido.status === 'cancelado' && pedido.motivoCancelamento && (
              <div style={{ marginTop: 12, fontSize: 12, background: 'var(--cinza)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                <strong>Motivo do cancelamento:</strong> {pedido.motivoCancelamento}
              </div>
            )}

            {aberto === pedido.id && pedido.observacoes && (
              <div style={{ marginTop: 12, fontSize: 12, background: 'var(--cinza)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                <strong>Observações:</strong> {pedido.observacoes}
              </div>
            )}

            {aberto === pedido.id && emEdicao && (
              <EdicaoPedido
                pedido={pedido}
                snapshot={snapshot}
                onSalvar={(dados) => handleSalvarEdicao(pedido.id, dados)}
                onCancelar={() => setEditando(null)}
              />
            )}

            {aberto === pedido.id && !emEdicao && (
              <table style={{ marginTop: 12 }}>
                <thead>
                  <tr><th>Código</th><th>Descrição</th><th>Pedido</th><th>Recebido</th><th></th></tr>
                </thead>
                <tbody>
                  {pedido.itens.map((item) => (
                    <tr key={item.codigo}>
                      <td>{item.codigo}</td>
                      <td>{item.descricao}</td>
                      <td>{item.qtdPedida}</td>
                      <td>{item.qtdRecebida ?? 0}</td>
                      <td>
                        {pedido.status !== 'cancelado' && (item.qtdRecebida ?? 0) < item.qtdPedida && (
                          <button
                            className="btn pequeno"
                            onClick={() => handleReceber(pedido.id, item.codigo, item.qtdPedida, item.qtdRecebida ?? 0)}
                          >
                            Registrar recebimento
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
