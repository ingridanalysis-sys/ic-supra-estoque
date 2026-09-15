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
  lead_time_dias integer,
  margem_seguranca_dias integer,
  fornecedor text,
  descontinuado boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- Pedidos de compra (cabeçalho)
create table if not exists pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references perfis(id),
  fornecedor text not null,
  status text not null default 'pendente' check (status in ('pendente', 'parcial', 'recebido')),
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

-- Row Level Security — habilite e ajuste as policies conforme os papéis
-- definidos em `perfis` quando for colocar múltiplos usuários em produção.
alter table snapshots_estoque enable row level security;
alter table itens_estoque enable row level security;
alter table config_produtos enable row level security;
alter table pedidos_compra enable row level security;
alter table itens_pedido_compra enable row level security;
alter table alertas_gerados enable row level security;
