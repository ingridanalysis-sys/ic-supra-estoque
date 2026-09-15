import { useState } from 'react';
import { extrairTextoPdf } from '../lib/pdfExtract';
import { parseRelatorioVendas } from '../lib/parsers/vendasParser';
import { salvarVendasMes, listarMesesImportados, removerVendasMes, mesJaImportado } from '../lib/historicoVendas';
import { aplicarGiroAutomatico } from '../lib/giroAutomatico';

function fmtMoeda(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ImportarVendas({ onGiroAtualizado }) {
  const [meses, setMeses] = useState(() => listarMesesImportados());
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [erro, setErro] = useState(null);

  async function handleArquivo(file) {
    setProcessando(true);
    setErro(null);
    setMensagem(null);
    try {
      const texto = await extrairTextoPdf(file, (atual, total) => setProgresso({ atual, total }));
      const relatorio = parseRelatorioVendas(texto);

      if (!relatorio.mesChave) {
        setErro('Não consegui identificar o período (mês) desse relatório. Confira se é o arquivo certo.');
        return;
      }

      if (mesJaImportado(relatorio.mesChave)) {
        const confirmar = window.confirm(
          `${relatorio.mesLabel} já foi importado antes.\n\nImportar de novo vai substituir os dados desse mês. Continuar?`
        );
        if (!confirmar) return;
      }

      salvarVendasMes(relatorio, file.name);
      const resultadoGiro = aplicarGiroAutomatico();
      setMeses(listarMesesImportados());
      onGiroAtualizado?.(resultadoGiro);

      setMensagem(
        `${relatorio.mesLabel} importado: ${relatorio.itens.length} produtos vendidos, ${fmtMoeda(relatorio.resumo.totalVendas)}. ` +
        `Giro semanal recalculado para ${resultadoGiro.atualizados} produto(s)` +
        (resultadoGiro.ignoradosManual > 0 ? ` (${resultadoGiro.ignoradosManual} mantiveram ajuste manual).` : '.')
      );
    } catch (e) {
      console.error(e);
      setErro('Não foi possível processar esse PDF. Confira se é um relatório de "Movimento Sintético de Vendas".');
    } finally {
      setProcessando(false);
      setProgresso(null);
    }
  }

  function handleRemover(mesChave, mesLabel) {
    if (!window.confirm(`Remover ${mesLabel} do histórico de vendas? Isso não desfaz o giro já calculado.`)) return;
    removerVendasMes(mesChave);
    setMeses(listarMesesImportados());
  }

  return (
    <div className="card">
      <h3>📈 Importar vendas mensais</h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        Um relatório por mês ("Movimento Sintético de Vendas"). O mês é detectado automaticamente pelo período do
        relatório — meses já importados ficam marcados abaixo, e reimportar pede confirmação antes de substituir.
      </p>

      <label className="dropzone" style={{ minHeight: 90, marginBottom: 12 }}>
        <div className="dz-titulo">Relatório de vendas (1 mês)</div>
        <div className="dz-descricao">Arraste o PDF aqui ou clique para selecionar</div>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => e.target.files?.[0] && handleArquivo(e.target.files[0])}
        />
      </label>

      {processando && (
        <div className="status-arquivo pendente">
          Lendo PDF… {progresso ? `página ${progresso.atual}/${progresso.total}` : ''}
        </div>
      )}
      {erro && <div className="status-arquivo erro">{erro}</div>}
      {mensagem && <div className="status-arquivo ok">{mensagem}</div>}

      {meses.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Meses já importados
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {meses.map((m) => (
              <span
                key={m.mesChave}
                className="tag"
                style={{ background: 'var(--verde-claro)', color: 'var(--verde)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title={`${m.itens.length} produtos · ${fmtMoeda(m.resumo.totalVendas)} · importado em ${new Date(m.importadoEm).toLocaleDateString('pt-BR')}`}
              >
                {m.mesLabel}
                <button
                  onClick={() => handleRemover(m.mesChave, m.mesLabel)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--verde)', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                  title="Remover este mês"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
