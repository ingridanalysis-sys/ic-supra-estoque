import { useMemo, useState } from 'react';

// Combina faturamento mensal (Mix de Vendas) com o valor investido em estoque
// (custo) num único gráfico, no mesmo eixo R$ — nunca eixo duplo, senão a
// escala relativa entre as duas métricas fica arbitrária.

function fmtMoeda(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMoedaCompleta(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Arredonda pra cima num número "redondo" (múltiplo de 1, 2, 5 × potência de
// 10) pra ter ticks de eixo limpos em qualquer ordem de grandeza.
function tetoArredondado(valor) {
  if (valor <= 0) return 100;
  const potencia = Math.pow(10, Math.floor(Math.log10(valor)));
  const passos = [1, 2, 2.5, 5, 10];
  for (const p of passos) {
    if (valor <= p * potencia) return p * potencia;
  }
  return 10 * potencia;
}

// Regressão linear simples (mínimos quadrados) — a linha de tendência sobre
// as barras de faturamento mensal.
function regressaoLinear(valores) {
  const n = valores.length;
  const somaX = valores.reduce((s, _, i) => s + i, 0);
  const somaY = valores.reduce((s, v) => s + v, 0);
  const somaXY = valores.reduce((s, v, i) => s + i * v, 0);
  const somaXX = valores.reduce((s, _, i) => s + i * i, 0);
  const denom = n * somaXX - somaX * somaX;
  const slope = denom !== 0 ? (n * somaXY - somaX * somaY) / denom : 0;
  const intercept = (somaY - slope * somaX) / n;
  return { slope, intercept, fitted: valores.map((_, i) => intercept + slope * i) };
}

const MESES_NOME = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function somarMeses(mesChave, quantidade) {
  const [anoStr, mesStr] = mesChave.split('-');
  let mesIdx = Number(mesStr) - 1 + quantidade;
  let ano = Number(anoStr) + Math.floor(mesIdx / 12);
  mesIdx = ((mesIdx % 12) + 12) % 12;
  return `${MESES_NOME[mesIdx]}/${ano}`;
}

/**
 * Ponto de equilíbrio em relação ao estoque: a partir da tendência de
 * faturamento mensal, em qual mês o faturamento de UM mês passaria a igualar
 * o valor hoje investido em estoque (índice fracionário na mesma escala de
 * meses usada pela regressão — index 0 é o primeiro mês importado).
 */
function calcularPontoEquilibrio({ slope, intercept, n, valorTotalEstoque, ultimoMesChave }) {
  if (valorTotalEstoque == null || slope <= 0) return null;
  const idx = (valorTotalEstoque - intercept) / slope;
  if (idx <= n - 1) {
    return { jaAtingido: true, idx };
  }
  const mesesAFrente = Math.ceil(idx - (n - 1));
  return { jaAtingido: false, idx, mesesAFrente, mesLabel: somarMeses(ultimoMesChave, mesesAFrente) };
}

export default function GraficoFaturamentoEstoque({ meses, valorTotalEstoque }) {
  const [tabela, setTabela] = useState(false);

  const dados = useMemo(
    () => meses.map((m) => ({ label: m.mesLabel, valor: m.resumo.totalVendas })),
    [meses]
  );

  const temTendencia = dados.length >= 2;
  const { fitted, slope, intercept } = temTendencia
    ? regressaoLinear(dados.map((d) => d.valor))
    : { fitted: [], slope: 0, intercept: 0 };

  const pontoEquilibrio = temTendencia
    ? calcularPontoEquilibrio({
        slope, intercept, n: dados.length, valorTotalEstoque, ultimoMesChave: meses[meses.length - 1]?.mesChave,
      })
    : null;

  if (dados.length === 0) {
    return (
      <div className="card">
        <h3>Faturamento vs. estoque</h3>
        <div className="vazio" style={{ padding: '16px 0' }}>
          Importe os meses de vendas na aba <strong>Mix de Vendas</strong> pra ver o faturamento comparado ao
          valor investido em estoque.
        </div>
      </div>
    );
  }

  // --- layout do SVG (viewBox fixo, escala responsiva via width 100%) ---
  const W = 760;
  const H = 300;
  const M = { top: 34, right: 24, bottom: 38, left: 68 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const domainMax = tetoArredondado(Math.max(...dados.map((d) => d.valor), valorTotalEstoque ?? 0) * 1.15);
  const y = (v) => M.top + plotH * (1 - v / domainMax);
  const n = dados.length;
  const bandaX = plotW / n;
  const barW = Math.min(24, bandaX * 0.45);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * domainMax);

  const pontosTendencia = fitted.map((v, i) => ({
    x: M.left + (i + 0.5) * bandaX,
    y: y(Math.max(0, v)),
  }));

  const yEstoque = valorTotalEstoque != null ? y(valorTotalEstoque) : null;

  // Projeção da tendência além dos meses importados, até o ponto de
  // equilíbrio com o estoque — clipada na borda direita do gráfico quando o
  // equilíbrio previsto está longe demais pra caber no eixo visível.
  let projecao = null;
  if (pontoEquilibrio && !pontoEquilibrio.jaAtingido) {
    const xBreak = M.left + (pontoEquilibrio.idx + 0.5) * bandaX;
    const dentroDoGrafico = xBreak <= W - M.right;
    const xFim = Math.min(xBreak, W - M.right);
    const yFim = dentroDoGrafico ? yEstoque : y(intercept + slope * ((xFim - M.left) / bandaX - 0.5));
    projecao = {
      de: pontosTendencia[pontosTendencia.length - 1],
      para: { x: xFim, y: yFim },
      marcador: dentroDoGrafico,
    };
  }

  return (
    <div className="card">
      <h3>Faturamento vs. estoque</h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -4, marginBottom: 14 }}>
        Faturamento mensal (Mix de Vendas) comparado ao valor investido em estoque hoje (custo) — mesma escala em R$.
      </p>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10, fontSize: 11.5, color: 'var(--muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--azul-hover)', display: 'inline-block' }} />
          Faturamento mensal
        </span>
        {temTendencia && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, background: 'var(--laranja)', display: 'inline-block' }} />
            Tendência
          </span>
        )}
        {projecao && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="var(--laranja)" strokeWidth="2" strokeDasharray="3 4" opacity="0.75" /></svg>
            Projeção até o equilíbrio
          </span>
        )}
        {yEstoque != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="var(--verde)" strokeWidth="2" strokeDasharray="4 3" /></svg>
            Estoque atual (custo)
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Faturamento mensal comparado ao valor em estoque">
        {/* gridlines + eixo Y */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#E2E5EA" strokeWidth="1" />
            <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10.5" fill="var(--muted)">
              {fmtMoeda(t)}
            </text>
          </g>
        ))}

        {/* barras de faturamento */}
        {dados.map((d, i) => {
          const cx = M.left + (i + 0.5) * bandaX;
          const yTopo = y(d.valor);
          const altura = M.top + plotH - yTopo;
          const r = Math.min(4, altura);
          const x0 = cx - barW / 2;
          const path = altura > 0
            ? `M${x0},${yTopo + r} Q${x0},${yTopo} ${x0 + r},${yTopo} L${x0 + barW - r},${yTopo} Q${x0 + barW},${yTopo} ${x0 + barW},${yTopo + r} L${x0 + barW},${yTopo + altura} L${x0},${yTopo + altura} Z`
            : '';
          // a linha de tendência pode passar perto do topo da barra (sobretudo
          // no último ponto) — o rótulo sempre soma clearance a partir do que
          // estiver mais alto entre a barra e a linha, nunca só da barra.
          const yTrendAqui = temTendencia ? pontosTendencia[i].y : Infinity;
          const labelY = Math.min(yTopo, yTrendAqui) - 10;
          return (
            <g key={d.label}>
              {path && <path d={path} fill="var(--azul-hover)"><title>{`${d.label}: ${fmtMoedaCompleta(d.valor)}`}</title></path>}
              <text x={cx} y={labelY} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--texto)">
                {fmtMoeda(d.valor)}
              </text>
              <text x={cx} y={H - M.bottom + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {d.label}
              </text>
            </g>
          );
        })}

        {/* linha de tendência */}
        {temTendencia && (
          <g>
            <polyline
              points={pontosTendencia.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--laranja)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={pontosTendencia[pontosTendencia.length - 1].x}
              cy={pontosTendencia[pontosTendencia.length - 1].y}
              r="4"
              fill="var(--laranja)"
              stroke="#fff"
              strokeWidth="2"
            />
          </g>
        )}

        {/* projeção da tendência até o ponto de equilíbrio com o estoque */}
        {projecao && (
          <g>
            <line
              x1={projecao.de.x} y1={projecao.de.y} x2={projecao.para.x} y2={projecao.para.y}
              stroke="var(--laranja)" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" opacity="0.75"
            />
            {projecao.marcador && (
              <>
                <circle cx={projecao.para.x} cy={projecao.para.y} r="5" fill="#fff" stroke="var(--laranja)" strokeWidth="2" />
                <text
                  x={Math.min(projecao.para.x, W - M.right - 4)}
                  y={projecao.para.y - 10}
                  textAnchor="end"
                  fontSize="10.5"
                  fontWeight="700"
                  fill="var(--texto)"
                >
                  Equilíbrio previsto: {pontoEquilibrio.mesLabel}
                </text>
              </>
            )}
          </g>
        )}

        {/* linha de referência: estoque atual */}
        {yEstoque != null && (
          <g>
            <line
              x1={M.left} x2={W - M.right} y1={yEstoque} y2={yEstoque}
              stroke="var(--verde)" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round"
            />
          </g>
        )}
      </svg>

      {temTendencia && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
          Tendência: {slope >= 0 ? '+' : ''}{fmtMoeda(slope)}/mês em relação ao período importado.
          {yEstoque != null && ` Estoque atual: ${fmtMoedaCompleta(valorTotalEstoque)}.`}
        </p>
      )}

      {pontoEquilibrio && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -6 }}>
          {pontoEquilibrio.jaAtingido
            ? '📍 Pelo ritmo da tendência, o faturamento de um único mês já se igualou ao valor investido em estoque dentro do próprio período importado.'
            : `📍 Ponto de equilíbrio com o estoque: no ritmo atual de crescimento, o faturamento de um único mês deve igualar o valor hoje investido em estoque em ${pontoEquilibrio.mesLabel} (~${pontoEquilibrio.mesesAFrente} ${pontoEquilibrio.mesesAFrente === 1 ? 'mês' : 'meses'} a partir do último mês importado).`}
        </p>
      )}
      {temTendencia && !pontoEquilibrio && slope <= 0 && valorTotalEstoque != null && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -6 }}>
          📍 A tendência atual não está em alta, então não é possível estimar um ponto de equilíbrio com o estoque.
        </p>
      )}

      <details style={{ marginTop: 6 }}>
        <summary
          style={{ cursor: 'pointer', fontSize: 12, color: 'var(--azul)' }}
          onClick={() => setTabela((v) => !v)}
        >
          Ver como tabela
        </summary>
        {tabela && (
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Mês</th><th>Faturamento</th><th>Estoque atual (custo)</th></tr></thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td>{fmtMoedaCompleta(d.valor)}</td>
                  <td>{valorTotalEstoque != null ? fmtMoedaCompleta(valorTotalEstoque) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}
