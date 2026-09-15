import { useState } from 'react';
import { extrairTextoPdf } from '../lib/pdfExtract';
import { parseRelatorioEstoque, unificarSnapshot } from '../lib/parsers/estoqueParser';
import { salvarSnapshot } from '../lib/historicoPedidos';

const TIPOS = [
  { chave: 'positivo', titulo: 'Estoque positivo', descricao: 'Itens de estoque atual (quantidade > 0)' },
  { chave: 'negativo', titulo: 'Estoque negativo', descricao: 'Itens de quantidade negativa (erro de contagem)' },
  { chave: 'zerado', titulo: 'Estoque zerado', descricao: 'Itens de quantidade zero (ruptura / sem giro)' },
];

function fmtMoeda(v) {
  const sinal = v < 0 ? '-' : '';
  return `${sinal}R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Dropzone({ tipo, arquivo, status, progresso, relatorio, onArquivo }) {
  const [arrastando, setArrastando] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onArquivo(tipo.chave, f);
  }

  const valorTotal = relatorio ? relatorio.itens.reduce((s, i) => s + i.total, 0) : null;

  return (
    <div className="dropzone-col">
      <label
        className={`dropzone ${arrastando ? 'arrastando' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={handleDrop}
      >
        <div className="dz-titulo">{tipo.titulo}</div>
        <div className="dz-descricao">{tipo.descricao}</div>
        <div className="dz-arquivo">
          {arquivo ? `📄 ${arquivo.name}` : 'Arraste o PDF aqui ou clique para selecionar'}
        </div>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => e.target.files?.[0] && onArquivo(tipo.chave, e.target.files[0])}
        />
      </label>

      {status === 'processando' && (
        <div className="status-arquivo pendente">
          Lendo PDF… {progresso ? `página ${progresso.atual}/${progresso.total}` : ''}
        </div>
      )}
      {status === 'erro' && <div className="status-arquivo erro">✖ Erro ao processar — confira o arquivo</div>}
      {status === 'ok' && relatorio && (
        <>
          <div className="status-arquivo ok">✔ Processado com sucesso</div>
          <div className="resumo-arquivo">
            {relatorio.itens.length} item(ns) · {fmtMoeda(valorTotal)}
            {relatorio.avisos.length > 0 && ` · ${relatorio.avisos.length} para conferência`}
          </div>
        </>
      )}
    </div>
  );
}

export default function ImportarEstoque({ onSnapshotGerado }) {
  const [arquivos, setArquivos] = useState({});
  const [status, setStatus] = useState({});
  const [progresso, setProgresso] = useState({});
  const [resultados, setResultados] = useState({});
  const [gerando, setGerando] = useState(false);
  const [erroGeral, setErroGeral] = useState(null);

  async function handleArquivo(chave, file) {
    setArquivos((s) => ({ ...s, [chave]: file }));
    setStatus((s) => ({ ...s, [chave]: 'processando' }));
    setResultados((r) => ({ ...r, [chave]: null }));
    setErroGeral(null);
    try {
      const texto = await extrairTextoPdf(file, (atual, total) =>
        setProgresso((p) => ({ ...p, [chave]: { atual, total } }))
      );
      const relatorio = parseRelatorioEstoque(texto, chave);
      setResultados((r) => ({ ...r, [chave]: relatorio }));
      setStatus((s) => ({ ...s, [chave]: 'ok' }));
    } catch (e) {
      console.error(e);
      setStatus((s) => ({ ...s, [chave]: 'erro' }));
    }
  }

  const todosProcessados = TIPOS.every((t) => status[t.chave] === 'ok');
  const totalAvisos = Object.values(resultados).reduce((s, r) => s + (r?.avisos?.length ?? 0), 0);

  function gerarAnalise() {
    setGerando(true);
    try {
      const snapshot = unificarSnapshot({
        positivo: resultados.positivo,
        negativo: resultados.negativo,
        zerado: resultados.zerado,
      });
      const registro = salvarSnapshot(snapshot);
      onSnapshotGerado(registro);
    } catch (e) {
      console.error(e);
      setErroGeral('Não foi possível gerar a análise. Confira os PDFs importados.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <div>
      <h2>Importar estoque atual</h2>
      <p className="subtitulo-pagina">
        Importe os três relatórios do sistema Net Use (positivo, negativo e zerado). Cada importação gera um novo
        snapshot com data e hora, comparável ao anterior.
      </p>

      <div className="dropzone-grid">
        {TIPOS.map((tipo) => (
          <Dropzone
            key={tipo.chave}
            tipo={tipo}
            arquivo={arquivos[tipo.chave]}
            status={status[tipo.chave]}
            progresso={progresso[tipo.chave]}
            relatorio={resultados[tipo.chave]}
            onArquivo={handleArquivo}
          />
        ))}
      </div>

      {totalAvisos > 0 && (
        <div className="card" style={{ background: 'var(--amarelo-claro)', borderColor: '#FDE68A' }}>
          <h3 style={{ color: 'var(--amarelo)' }}>⚠️ {totalAvisos} linha(s) para conferência</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Nessas linhas o total impresso no relatório não bate exatamente com preço × quantidade — pode ser
            arredondamento do sistema de origem, mas vale conferir antes de confiar 100% nesses itens específicos.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--azul)' }}>Ver linhas para conferência</summary>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Código</th><th>Descrição</th><th>Motivo</th></tr></thead>
              <tbody>
                {Object.entries(resultados).flatMap(([chave, r]) =>
                  (r?.avisos ?? []).map((a, i) => (
                    <tr key={`${chave}-${i}`}>
                      <td>{a.codigo}</td>
                      <td>{a.descricao}</td>
                      <td>{a.motivo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {erroGeral && <div className="status-arquivo erro" style={{ marginBottom: 10 }}>{erroGeral}</div>}

      <div className="rodape-acoes">
        <button className="btn" disabled={!todosProcessados || gerando} onClick={gerarAnalise}>
          {gerando ? 'Gerando análise…' : 'Gerar nova análise'}
        </button>
      </div>
    </div>
  );
}
