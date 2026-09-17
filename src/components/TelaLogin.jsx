import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Só é renderizada quando isSupabaseConfigured() já é true (ver App.jsx) —
// pode assumir que `supabase` não é null. Sem cadastro/recuperação de senha
// aqui: as contas são criadas manualmente pelo dono do site no painel do
// Supabase (Authentication → Users), são só 4 pessoas do time.
export default function TelaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        setErro('E-mail ou senha incorretos.');
      }
      // sucesso: App.jsx reage sozinho via onAuthStateChange, não precisa fazer nada aqui
    } catch {
      setErro('Não foi possível conectar. Verifique sua internet e tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="tela-login">
      <form className="card login-card" onSubmit={handleSubmit}>
        <img src="/logo-ic-header.png" alt="IC SupraHospitalar" className="login-logo" />
        <h2 style={{ textAlign: 'center' }}>Gestão de Estoque</h2>
        <p className="subtitulo-pagina" style={{ textAlign: 'center' }}>Entre com seu e-mail e senha.</p>

        <label className="login-campo">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            disabled={carregando}
          />
        </label>

        <label className="login-campo">
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            disabled={carregando}
          />
        </label>

        {erro && <div className="status-arquivo erro" style={{ marginBottom: 4 }}>{erro}</div>}

        <button className="btn" type="submit" disabled={carregando} style={{ width: '100%', justifyContent: 'center' }}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
