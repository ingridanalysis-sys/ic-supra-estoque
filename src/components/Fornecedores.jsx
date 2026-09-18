import { useMemo, useState } from 'react';
import {
  listarFornecedores,
  listarVinculos,
  criarFornecedor,
  atualizarFornecedor,
  desativarFornecedor,
  migrarFornecedoresDeTextoLivre,
} from '../lib/fornecedores';

function fmtMoeda(v) {
  return `R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const FORM_VAZIO = { nome: '', email: '', telefone: '', envioAutomatico: false };

function FormFornecedor({ inicial, titulo, onSalvar, onCancelar }) {
  const [dados, setDados] = useState(inicial);

  function campo(chave, valor) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  return (
    <div className="card">
      <strong>{titulo}</strong>
      <div className="linha-flex" style={{ flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        <label style={{ fontSize: 11 }}>
          Nome{' '}
          <input type="text" value={dados.nome} onChange={(e) => campo('nome', e.target.value)} style={{ width: 200 }} />
        </label>
        <label style={{ fontSize: 11 }}>
          E-mail{' '}
          <input type="email" value={dados.email ?? ''} onChange={(e) => campo('email', e.target.value)} style={{ width: 220 }} />
        </label>
        <label style={{ fontSize: 11 }}>
          Telefone/WhatsApp{' '}
          <input type="text" value={dados.telefone ?? ''} onChange={(e) => campo('telefone', e.target.value)} style={{ width: 150 }} />
        </label>
        <label style={{ fontSize: 11 }}>
          <input
            type="checkbox"
            checked={!!dados.envioAutomatico}
            onChange={(e) => campo('envioAutomatico', e.target.checked)}
          />{' '}
          Envio automático da ordem de compra por e-mail
        </label>
      </div>
      <div className="linha-flex" style={{ marginTop: 12, gap: 8 }}>
        <button
          className="btn pequeno"
          disabled={!dados.nome.trim()}
          onClick={() => onSalvar(dados)}
        >
          Salvar
        </button>
        <button className="btn secundario pequeno" onClick={onCancelar}>Cancelar</button>
      </div>
      {dados.envioAutomatico && !dados.email && (
        <p style={{ fontSize: 11, color: 'var(--amarelo)', marginTop: 8 }}>
          Envio automático ligado, mas sem e-mail cadastrado — a ordem vai continuar caindo no download manual até ter um e-mail aqui.
        </p>
      )}
    </div>
  );
}

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState(listarFornecedores());
  const [vinculos, setVinculos] = useState(listarVinculos());
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [busca, setBusca] = useState('');

  function recarregar() {
    setFornecedores(listarFornecedores());
    setVinculos(listarVinculos());
  }

  const statsPorFornecedor = useMemo(() => {
    const mapa = new Map();
    for (const v of vinculos) {
      if (!mapa.has(v.fornecedorId)) mapa.set(v.fornecedorId, { total: 0, disponiveis: 0, somaCusto: 0, comCusto: 0 });
      const s = mapa.get(v.fornecedorId);
      s.total += 1;
      if (v.disponivel) s.disponiveis += 1;
      if (v.custoUnitario != null) { s.somaCusto += v.custoUnitario; s.comCusto += 1; }
    }
    return mapa;
  }, [vinculos]);

  const fornecedoresFiltrados = useMemo(() => {
    let lista = fornecedores;
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      lista = lista.filter((f) => f.nome.toLowerCase().includes(b));
    }
    return [...lista].sort((a, b) => (a.ativo === b.ativo ? a.nome.localeCompare(b.nome) : a.ativo ? -1 : 1));
  }, [fornecedores, busca]);

  function handleImportar() {
    const raw = localStorage.getItem('ic_supra_snapshots_v1');
    let snapshot = null;
    try { snapshot = raw ? JSON.parse(raw)[0] : null; } catch { snapshot = null; }
    if (!snapshot) {
      window.alert('Nenhum estoque importado nesta sessão — importe um relatório de estoque primeiro, na aba Importar.');
      return;
    }
    const resumo = migrarFornecedoresDeTextoLivre(snapshot.itens);
    window.alert(
      `${resumo.fornecedoresCriados} fornecedor(es) novo(s) cadastrado(s), ` +
      `${resumo.vinculosCriados} vínculo(s) produto/fornecedor criado(s)` +
      (resumo.ignorados > 0 ? ` (${resumo.ignorados} produto(s) já tinham vínculo e foram ignorados).` : '.')
    );
    recarregar();
  }

  return (
    <div>
      <h2>Fornecedores</h2>
      <p className="subtitulo-pagina">
        Cadastro de fornecedores e o vínculo com cada produto (custo e disponibilidade por fornecedor). Um produto pode
        ter mais de um fornecedor — se um deles marcar o item como indisponível, a Ordem de Compra não trava por isso,
        só busca outro fornecedor cadastrado para aquele item.
      </p>

      <div className="filtros">
        <button className="btn pequeno" onClick={() => setCriando(true)}>+ Novo fornecedor</button>
        <button className="btn secundario pequeno" onClick={handleImportar}>
          Importar fornecedores já digitados nos produtos
        </button>
        <input
          type="text"
          placeholder="Buscar fornecedor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: 200 }}
        />
      </div>

      {criando && (
        <FormFornecedor
          inicial={FORM_VAZIO}
          titulo="Novo fornecedor"
          onSalvar={(dados) => { criarFornecedor(dados); setCriando(false); recarregar(); }}
          onCancelar={() => setCriando(false)}
        />
      )}

      {fornecedoresFiltrados.length === 0 && !criando && (
        <div className="vazio">Nenhum fornecedor cadastrado ainda.</div>
      )}

      {fornecedoresFiltrados.map((f) => {
        const s = statsPorFornecedor.get(f.id) ?? { total: 0, disponiveis: 0, somaCusto: 0, comCusto: 0 };
        const custoMedio = s.comCusto > 0 ? s.somaCusto / s.comCusto : null;
        const emEdicao = editando === f.id;
        if (emEdicao) {
          return (
            <FormFornecedor
              key={f.id}
              inicial={{ nome: f.nome, email: f.email ?? '', telefone: f.telefone ?? '', envioAutomatico: f.envioAutomatico }}
              titulo={`Editando ${f.nome}`}
              onSalvar={(dados) => { atualizarFornecedor(f.id, dados); setEditando(null); recarregar(); }}
              onCancelar={() => setEditando(null)}
            />
          );
        }
        return (
          <div className="card" key={f.id} style={{ opacity: f.ativo ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{f.nome}</strong> {!f.ativo && <span className="tag" style={{ color: 'var(--muted)', background: 'var(--cinza)' }}>Inativo</span>}
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {f.email || 'sem e-mail cadastrado'} · {f.telefone || 'sem telefone cadastrado'} ·{' '}
                  {f.envioAutomatico ? 'Envio automático ligado' : 'Envio automático desligado'}
                </div>
              </div>
              <div className="linha-flex">
                <button className="btn secundario pequeno" onClick={() => setEditando(f.id)}>Editar</button>
                <button
                  className="btn secundario pequeno"
                  onClick={() => {
                    if (f.ativo) desativarFornecedor(f.id);
                    else atualizarFornecedor(f.id, { ativo: true });
                    recarregar();
                  }}
                >
                  {f.ativo ? 'Desativar' : 'Reativar'}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              {s.total} produto(s) vinculado(s) · {s.disponiveis} disponível(is) · custo médio {custoMedio != null ? fmtMoeda(custoMedio) : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
