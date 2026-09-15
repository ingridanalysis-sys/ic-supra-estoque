import { useState } from 'react';
import { listarPedidos, registrarRecebimento } from '../lib/historicoPedidos';

const STATUS_COR = {
  pendente: { cor: 'var(--amarelo)', fundo: 'var(--amarelo-claro)', label: 'Pendente' },
  parcial: { cor: 'var(--azul)', fundo: 'var(--azul-claro)', label: 'Parcial' },
  recebido: { cor: 'var(--verde)', fundo: 'var(--verde-claro)', label: 'Recebido' },
};

export default function HistoricoPedidos() {
  const [pedidos, setPedidos] = useState(listarPedidos());
  const [aberto, setAberto] = useState(null);

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

  if (pedidos.length === 0) {
    return <div className="vazio">Nenhum pedido de compra registrado ainda.</div>;
  }

  return (
    <div>
      <h2>Histórico de pedidos</h2>
      <p className="subtitulo-pagina">Todos os pedidos gerados pelo sistema, com status de recebimento.</p>

      {pedidos.map((pedido) => {
        const s = STATUS_COR[pedido.status];
        const totalPedido = pedido.itens.reduce((s2, i) => s2 + i.qtdPedida * i.custoUnit, 0);
        return (
          <div className="card" key={pedido.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{pedido.fornecedor}</strong>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {new Date(pedido.criadoEm).toLocaleString('pt-BR')} · {pedido.itens.length} item(ns) · R$ {totalPedido.toFixed(2).replace('.', ',')}
                </div>
              </div>
              <div className="linha-flex">
                <span className="tag" style={{ color: s.cor, background: s.fundo }}>{s.label}</span>
                <button className="btn secundario pequeno" onClick={() => setAberto(aberto === pedido.id ? null : pedido.id)}>
                  {aberto === pedido.id ? 'Fechar' : 'Detalhes'}
                </button>
              </div>
            </div>

            {aberto === pedido.id && (
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
                        {(item.qtdRecebida ?? 0) < item.qtdPedida && (
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
