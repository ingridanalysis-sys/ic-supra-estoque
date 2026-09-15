// ═══════════════════════════════════════════════════════════════════
// NETLIFY FUNCTION — ANÁLISE DE ESTOQUE POR IA
//
// Mesmo princípio do "Resumo do Mês" do Fruta Polpa: a chave da Anthropic
// não pode ficar no front (o app roda inteiro no navegador). E o modelo
// NUNCA calcula nada — todo alerta, nível de urgência e dias de cobertura
// já chegam prontos do motor de regras (src/lib/alertas.js), conferidos.
// A IA só escreve a interpretação em texto corrido.
//
// Variável de ambiente no Netlify:
//   ANTHROPIC_API_KEY_ICSUPRA  (obrigatória; ou ANTHROPIC_API_KEY)
// ═══════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';

const MODELO = 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;

const SISTEMA = `Você é o analista de compras da IC Supra Hospitalar, uma distribuidora de produtos hospitalares em Teresina (PI). Escreve para o proprietário, Ivo Leite, que decide o que comprar.

REGRAS INEGOCIÁVEIS
1. Todos os números (estoque, dias de cobertura, nível de alerta) já vêm calculados no JSON recebido. Nunca calcule, estime ou arredonde de cabeça um número que não esteja lá.
2. Nunca invente fornecedor, prazo de entrega ou causa de ruptura que não esteja nos dados.
3. Priorize sempre nesta ordem: estoque negativo (erro de contagem a corrigir) > ruptura (zerado) > crítico > atenção.
4. Valores em reais no formato R$ 1.234,56.

COMO ESCREVER
- Português brasileiro, direto, sem enrolação e sem jargão de consultoria.
- Sem emoji, sem bullet decorativo — parágrafos curtos.
- Estrutura: (1) um parágrafo abrindo com quantos itens exigem ação e o mais urgente; (2) um parágrafo agrupando por tipo de problema (erro de contagem, ruptura, crítico); (3) um parágrafo curto de recomendação prática de por onde começar.
- Entre 150 e 300 palavras.`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ erro: 'Use POST.' }, 405);
  }

  const apiKeyBruta = process.env.ANTHROPIC_API_KEY_ICSUPRA || process.env.ANTHROPIC_API_KEY || '';
  const apiKey = apiKeyBruta.trim();
  if (!apiKey) {
    return json({
      erro: 'chave_ausente',
      mensagem: 'A variável ANTHROPIC_API_KEY_ICSUPRA não está configurada. No Netlify: Site settings → Environment variables. O painel de alertas continua funcionando sem ela — só o texto não é gerado.',
    }, 503);
  }

  let dados;
  try {
    dados = await req.json();
  } catch {
    return json({ erro: 'json_invalido', mensagem: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  if (!dados || !Array.isArray(dados.alertas)) {
    return json({ erro: 'payload_incompleto', mensagem: 'Faltam os alertas no corpo da requisição.' }, 400);
  }

  const client = new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' });

  try {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: SISTEMA,
      messages: [{
        role: 'user',
        content: `Escreva a análise de compras com base nestes alertas já calculados.\n\n${JSON.stringify(dados, null, 2)}\n\nComece direto pelo primeiro parágrafo, sem título e sem preâmbulo.`,
      }],
    });

    const texto = resposta.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return json({ texto });
  } catch (e) {
    return json({ erro: 'falha_ia', mensagem: e?.message || 'Erro ao chamar a API da Anthropic.' }, 502);
  }
};
