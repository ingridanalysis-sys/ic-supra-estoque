import { useState } from 'react';

export default function AnaliseIA({ painel }) {
  const [texto, setTexto] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    setTexto(null);
    try {
      const alertasResumidos = painel
        .filter((i) => i.alerta.nivel !== 'OK')
        .map((i) => ({
          codigo: i.codigo,
          descricao: i.descricao,
          nivel: i.alerta.nivel,
          estoqueAtual: i.quantidade,
          diasCobertura: i.alerta.diasCobertura,
          motivo: i.alerta.motivo,
        }));

      const resp = await fetch('/.netlify/functions/analise-estoque', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertas: alertasResumidos, geradoEm: new Date().toISOString() }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setErro(data.mensagem || 'Não foi possível gerar a análise.');
        return;
      }
      setTexto(data.texto);
    } catch (e) {
      setErro('Função de IA indisponível neste ambiente (só funciona publicado no Netlify, não em "npm run dev").');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="card" style={{ background: 'var(--roxo-claro)', borderColor: '#DDD6FE' }}>
      <h3 style={{ color: 'var(--roxo)' }}>🤖 Análise escrita por IA</h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        A IA não calcula nada — só recebe os alertas já prontos e escreve a interpretação em texto.
      </p>
      {!texto && (
        <button className="btn" style={{ background: 'var(--roxo)' }} disabled={carregando} onClick={gerar}>
          {carregando ? 'Gerando…' : 'Gerar análise'}
        </button>
      )}
      {erro && <div className="status-arquivo erro" style={{ marginTop: 8 }}>{erro}</div>}
      {texto && (
        <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {texto}
          <div style={{ marginTop: 10 }}>
            <button className="btn secundario pequeno" onClick={() => setTexto(null)}>Gerar de novo</button>
          </div>
        </div>
      )}
    </div>
  );
}
