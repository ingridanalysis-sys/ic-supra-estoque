# Gestão de Estoque — IC Supra Hospitalar

Sistema de análise de estoque, alertas de compra e geração de ordens de compra em PDF,
construído no mesmo padrão do sistema de auditoria da Fruta Polpa: cálculo determinístico
no cliente + uma Netlify Function que só escreve a interpretação em texto via IA.

## O que já funciona

- **Importação dos 3 relatórios do sistema Net Use** (estoque positivo, negativo e zerado),
  em PDF, direto no navegador — sem enviar o arquivo para nenhum servidor.
- **Parser tolerante a ruído de extração de PDF**: o relatório da Net Use imprime "Código"
  e "Barras/Ref." colados sem espaço (ex: `270270` = código 270 + ref. 270). O parser separa
  isso automaticamente e marca como "para conferência" qualquer linha onde não conseguiu
  identificar a unidade de medida com segurança.
- **Motor de alertas de compra** (`src/lib/alertas.js`) com 6 níveis: Negativo (erro de
  contagem), Ruptura (zerado), Crítico, Atenção, Monitorar, OK. Considera estoque mínimo,
  giro semanal e lead time do fornecedor quando cadastrados por produto.
- **Histórico de pedidos de compra**, com controle de recebimento (pendente/parcial/recebido),
  usado para não sugerir comprar de novo o que já está a caminho.
- **Ordem de compra em PDF**, segmentada por fornecedor, com a identidade visual da IC Supra.
- **Mix de Vendas**: importe os relatórios mensais de "Movimento Sintético de Vendas" (um arquivo por mês — os
  meses já importados ficam marcados, e reimportar um mês pede confirmação antes de substituir). A partir daí:
  - o **giro semanal de cada produto é calculado automaticamente** (média mensal vendida ÷ semanas do mês) e
    aplicado ao motor de alertas — sem precisar mais cadastrar isso manualmente item a item. Se você editar o
    giro manualmente depois, aquele produto fica marcado como "manual" e as próximas importações não o sobrescrevem;
  - a aba mostra **participação por setor e por produto** (estilo "Mix de Vendas" com barra de participação),
    pra ver rápido onde está concentrado o faturamento antes de montar o próximo pedido.
- **Análise por IA** (aba Visão Geral → "Gerar análise"): recebe os alertas já calculados e
  escreve a interpretação em texto — nunca calcula nada sozinha.

## Rodando localmente

```
npm install
npm run dev
```

Abre em `http://localhost:5173`. Sem nenhuma configuração adicional, o app já funciona
inteiro em **modo local**: os imports, alertas e PDFs funcionam normalmente, só não ficam
salvos entre sessões de outro navegador/computador (os dados ficam no localStorage
do navegador, então sobrevivem a um F5, mas não a limpar os dados do navegador).

A função de IA (`analise-estoque.js`) **não roda** com `npm run dev` puro (Vite não serve
Netlify Functions). Para testá-la localmente, use `netlify dev` com a variável de ambiente
exportada no shell (veja a seção de IA abaixo).

Pra testar a persistência Supabase localmente, copie `.env.example` para `.env` (não é
commitado) e preencha as duas variáveis — veja a seção abaixo.

## Publicando no Netlify

1. Suba esta pasta para um repositório Git, ou arraste direto em
   [app.netlify.com/drop](https://app.netlify.com/drop) para um teste rápido.
2. No Netlify: **Add new site → Import an existing project**.
3. Build command: `npm run build` · Publish directory: `dist` (o `netlify.toml` já deixa isso pronto).
4. Deploy. Em ~1 minuto o site está no ar.

## Conectando o Supabase (persistência real)

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito é suficiente para começar).
2. **SQL Editor** → cole o conteúdo de `schema.sql` → **Run**.
3. **Project Settings → API** → copie a `Project URL` e a `anon public key`.
4. No Netlify (ou no seu `.env` local): configure
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. No Netlify: **Deploys → Trigger deploy** (ou reinicie `npm run dev` localmente).

Com as duas variáveis presentes, o app passa a sincronizar de verdade: ao abrir, uma tela
rápida de "Sincronizando…" aparece enquanto ele busca os dados mais recentes do Supabase
(config de produtos, os 2 últimos snapshots de estoque, pedidos de compra e todos os meses
de vendas importados) e faz merge com o que já estava salvo localmente. Toda escrita
depois disso (importar estoque/vendas, configurar produto, gerar ordem, registrar
recebimento) é salva local **e** enviada em segundo plano pro Supabase — se a rede cair ou
o Supabase estiver fora do ar, o app nunca trava, só volta a sincronizar na próxima vez.

**Sem essas variáveis, nada muda**: o app continua funcionando 100% em modo local
(localStorage), exatamente como antes.

### Login (4 usuários)

O app agora exige login (Supabase Auth, e-mail + senha) sempre que o Supabase estiver
configurado — em modo local não tem tela de login, porque não há nada pra proteger.

1. **Supabase Dashboard → Authentication → Users → Add user**, uma vez por pessoa
   (e-mail + senha). Isso é manual, feito direto no painel — o app não tem cadastro.
2. Depois de criadas, pegue o `id` (UUID) de cada uma na mesma lista de usuários e rode no
   **SQL Editor**:
   ```sql
   insert into perfis (id, nome, papel) values
     ('uuid-da-pessoa-1', 'Nome da pessoa', 'admin'),
     ('uuid-da-pessoa-2', 'Nome da pessoa', 'comprador');
   -- papel: 'admin' | 'comprador' | 'visualizador' (só informativo por enquanto)
   ```
3. Rode (ou re-rode) o `schema.sql` inteiro — a seção de Row Level Security foi reescrita
   pra exigir login (`to authenticated`) em vez da chave anônima; é seguro rodar de novo
   mesmo que você já tenha rodado uma versão anterior deste arquivo (os `drop policy if
   exists` cuidam disso).
4. Faça login no site publicado com uma das contas antes de considerar pronto.

**Antes de existir login**, qualquer um com a chave anônima (visível no bundle publicado)
lia e escrevia tudo — isso foi fechado nesta versão: as policies agora exigem uma sessão
autenticada de verdade, não só a chave.

## Configurando a IA da Análise de Estoque

A aba **Visão Geral** tem um botão "Gerar análise" que funciona sem configuração nenhuma
— ele só avisa que a função não está disponível se a chave não estiver configurada.

1. Pegue uma chave em [console.anthropic.com](https://console.anthropic.com) → API Keys.
2. No Netlify: **Site settings → Environment variables**:
   - `ANTHROPIC_API_KEY_ICSUPRA` = a chave (começa com `sk-ant-`)
3. **Deploys → Trigger deploy**.

Modelo usado: `claude-sonnet-4-6`, `max_tokens` 1500 (a análise tem entre 150 e 300 palavras).
Custo por análise gerada: menos de um centavo.

## Pendente / próximos passos naturais

- **Dados de giro/vendas por produto** — hoje o cálculo de "dias de cobertura" só entra em
  ação quando você cadastra manualmente o giro semanal de um produto (botão "Configurar" no
  Painel de Alertas). O próximo passo é importar isso automaticamente de um relatório de
  vendas, em vez de cadastro manual item a item.
- **Fornecedor por produto** — a Net Use não traz fornecedor no relatório de estoque. Hoje
  você define o fornecedor na hora de montar a ordem de compra (fica salvo e sugerido nas
  próximas vezes). Se você tiver uma lista produto→fornecedor, dá para importar em lote.
- **Papéis/permissões por usuário** — `perfis.papel` (admin/comprador/visualizador) hoje é
  só informativo; todo usuário autenticado tem acesso total aos dados. Diferenciar o que
  cada papel pode fazer é um próximo passo natural, não implementado ainda.
- **Conferência dos avisos do relatório "zerado"** — é um relatório com muitas páginas e
  milhares de itens; boa parte é catálogo antigo/descontinuado. Vale um passo de "marcar
  como descontinuado" em lote para eles pararem de aparecer nos alertas.

## Estrutura do projeto

```
src/
  App.jsx                    ← shell principal, abas
  theme.js                   ← tokens de cor (paleta da IC Supra)
  lib/
    parsers/
      estoqueParser.js       ← parser dos 3 relatórios PDF + unificação em snapshot
    pdfExtract.js            ← extração de texto de PDF no navegador (pdf.js)
    alertas.js                ← motor de classificação de urgência (puro, sem IA)
    configProdutos.js         ← estoque mínimo / giro / lead time / fornecedor por produto
    historicoPedidos.js       ← snapshots + pedidos de compra
    historicoVendas.js        ← meses de vendas importados (Mix de Vendas)
    ordemCompraPdf.js         ← geração do PDF da ordem de compra (pdf-lib)
    supabaseClient.js         ← cliente Supabase (null se não configurado)
    sync/
      push.js                 ← empurra cada escrita local pro Supabase, em segundo plano
      pull.js                 ← puxa tudo do Supabase no início da sessão, faz merge local
  components/
    ImportarEstoque.jsx
    Dashboard.jsx
    PainelAlertas.jsx
    OrdemCompra.jsx
    HistoricoPedidos.jsx
    AnaliseIA.jsx
    TagAlerta.jsx
netlify/functions/
  analise-estoque.js          ← guarda a chave da Anthropic e chama a Messages API
schema.sql                     ← script para rodar no Supabase SQL Editor
```
