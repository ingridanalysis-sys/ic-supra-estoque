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
4. No Netlify: **Site settings → Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploys → Trigger deploy**.

> Nesta primeira versão o app roda em modo local (localStorage). A camada Supabase
> ainda não está implementada no código — é o próximo passo natural quando fizer sentido
> migrar de "protótipo validando o formato dos relatórios" para "sistema em produção com
> histórico entre sessões e múltiplos usuários". O `schema.sql` já está pronto para isso.

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
- **Persistência Supabase** — ver seção acima.
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
    historicoPedidos.js       ← snapshots + pedidos de compra (localStorage por ora)
    ordemCompraPdf.js         ← geração do PDF da ordem de compra (pdf-lib)
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
