-- ═══════════════════════════════════════════════════════════════════
-- Schema Supabase — Gestão de Estoque IC Supra Hospitalar
--
-- Rode este script inteiro no SQL Editor do Supabase (Passo 3 do README)
-- para habilitar persistência real entre sessões e múltiplos usuários.
-- Antes disso, o app funciona inteiro em "modo local" (localStorage).
-- ═══════════════════════════════════════════════════════════════════

-- Perfis / papéis de quem usa o sistema
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null check (papel in ('admin', 'comprador', 'visualizador')),
  criado_em timestamptz not null default now()
);

-- Um registro por importação de estoque (snapshot)
create table if not exists snapshots_estoque (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references perfis(id),
  total_itens integer not null,
  valor_total_estoque numeric(14,2) not null,
  itens_negativos integer not null default 0,
  itens_zerados integer not null default 0,
  itens_positivos integer not null default 0
);

-- Itens de cada snapshot (uma linha por produto por importação)
create table if not exists itens_estoque (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references snapshots_estoque(id) on delete cascade,
  codigo text not null,
  codigo_barras text,
  descricao text not null,
  unidade text,
  preco_custo numeric(12,2) not null default 0,
  quantidade numeric(12,2) not null default 0,
  total numeric(14,2) not null default 0,
  origem text not null check (origem in ('positivo', 'negativo', 'zerado')),
  confianca text not null default 'alta' check (confianca in ('alta', 'media', 'baixa'))
);
create index if not exists idx_itens_estoque_snapshot on itens_estoque(snapshot_id);
create index if not exists idx_itens_estoque_codigo on itens_estoque(codigo);

-- Configuração manual por produto: estoque mínimo, giro, lead time, fornecedor
create table if not exists config_produtos (
  codigo text primary key,
  estoque_minimo numeric(12,2),
  giro_semanal numeric(12,2),
  giro_origem text check (giro_origem in ('automatico', 'manual')),
  lead_time_dias integer,
  margem_seguranca_dias integer,
  fornecedor text,
  setor text,
  descontinuado boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- Pedidos de compra (cabeçalho)
create table if not exists pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references perfis(id),
  fornecedor text not null,
  status text not null default 'pendente' check (status in ('pendente', 'parcial', 'recebido')),
  observacoes text,
  pdf_url text
);

-- Itens de cada pedido de compra
create table if not exists itens_pedido_compra (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references pedidos_compra(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  unidade text,
  qtd_pedida numeric(12,2) not null,
  qtd_recebida numeric(12,2) not null default 0,
  custo_unit numeric(12,2) not null default 0
);
create index if not exists idx_itens_pedido_pedido on itens_pedido_compra(pedido_id);

-- Um registro por mês de vendas importado (Mix de Vendas) — reimportar o
-- mesmo mês SUBSTITUI (upsert no cabeçalho + apaga e reinsere os itens),
-- nunca duplica. Mesma lógica de src/lib/historicoVendas.js.
create table if not exists vendas_mensais (
  mes_chave text primary key, -- "2026-06"
  mes_label text not null, -- "Junho/2026"
  periodo_inicio text,
  periodo_fim text,
  resumo jsonb not null default '{}'::jsonb,
  nome_arquivo text,
  importado_em timestamptz not null default now()
);

-- Itens vendidos em cada mês (uma linha por produto por mês)
create table if not exists itens_venda_mensal (
  id bigint generated always as identity primary key,
  mes_chave text not null references vendas_mensais(mes_chave) on delete cascade,
  codigo text not null,
  codigo_barras text,
  descricao text not null,
  unidade text,
  qtde_notas numeric(12,2) not null default 0,
  qtde_volumes numeric(12,2) not null default 0,
  tot_comissoes numeric(14,2) not null default 0,
  tot_vendas numeric(14,2) not null default 0
);
create index if not exists idx_itens_venda_mes on itens_venda_mensal(mes_chave);
create index if not exists idx_itens_venda_codigo on itens_venda_mensal(codigo);

-- Snapshot do alerta no momento em que foi gerado — permite provar
-- "isso já estava sinalizado desde tal data" mesmo depois que o estoque mudar.
create table if not exists alertas_gerados (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references snapshots_estoque(id) on delete cascade,
  codigo text not null,
  nivel text not null check (nivel in ('NEGATIVO', 'RUPTURA', 'CRITICO', 'ATENCAO', 'MONITORAR', 'OK')),
  dias_cobertura numeric(10,1),
  motivo text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_alertas_snapshot on alertas_gerados(snapshot_id);
create index if not exists idx_alertas_codigo on alertas_gerados(codigo);

-- Row Level Security
--
-- TEMPORÁRIO: o app ainda não tem login (a tabela `perfis` acima é só
-- preparação futura). Sem autenticação, a chave anônima do Supabase fica
-- visível no bundle publicado — qualquer policy aqui só decide o que ESSA
-- chave pode fazer, não esconde a chave em si. Por isso as policies abaixo
-- são deliberadamente permissivas (equivalente, na prática, a "sem RLS")
-- até existir login de verdade. Quando `perfis` entrar em uso, troque
-- `using (true)` por uma checagem em `auth.uid()`/`papel`.
alter table snapshots_estoque enable row level security;
alter table itens_estoque enable row level security;
alter table config_produtos enable row level security;
alter table pedidos_compra enable row level security;
alter table itens_pedido_compra enable row level security;
alter table alertas_gerados enable row level security;
alter table vendas_mensais enable row level security;
alter table itens_venda_mensal enable row level security;

create policy anon_full_access on snapshots_estoque for all to anon using (true) with check (true);
create policy anon_full_access on itens_estoque for all to anon using (true) with check (true);
create policy anon_full_access on config_produtos for all to anon using (true) with check (true);
create policy anon_full_access on pedidos_compra for all to anon using (true) with check (true);
create policy anon_full_access on itens_pedido_compra for all to anon using (true) with check (true);
create policy anon_full_access on alertas_gerados for all to anon using (true) with check (true);
create policy anon_full_access on vendas_mensais for all to anon using (true) with check (true);
create policy anon_full_access on itens_venda_mensal for all to anon using (true) with check (true);
