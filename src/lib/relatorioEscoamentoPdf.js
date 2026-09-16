import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const AZUL = rgb(0x0c / 255, 0x3d / 255, 0x6e / 255);
const CINZA_TEXTO = rgb(0x37 / 255, 0x41 / 255, 0x51 / 255);
const CINZA_MUTED = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255);
const CINZA_BORDA = rgb(0xe2 / 255, 0xe5 / 255, 0xea / 255);
const BRANCO = rgb(1, 1, 1);

const MARGEM = 40;
const LARGURA_PAGINA = 595.28; // A4
const ALTURA_PAGINA = 841.89;

function fmtMoeda(v) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

/**
 * Gera o PDF da lista de "Valor para escoamento" — produtos com estoque
 * positivo sem venda registrada nos últimos meses importados do Mix de
 * Vendas. `itens` já vem ordenado (maior valor parado primeiro).
 */
export async function gerarRelatorioEscoamentoPdf({ itens, valorTotal, mesesConsiderados, logoBytes }) {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null;
  if (logoBytes) {
    try {
      logoImg = await pdf.embedPng(logoBytes);
    } catch {
      logoImg = null;
    }
  }

  let page = pdf.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
  let y = ALTURA_PAGINA - MARGEM;

  const colX = { codigo: MARGEM, desc: MARGEM + 55, setor: MARGEM + 290, qtd: MARGEM + 415, valor: MARGEM + 460 };

  function desenharCabecalhoColunas() {
    page.drawText('Código', { x: colX.codigo, y, size: 8, font: fontBold, color: CINZA_MUTED });
    page.drawText('Descrição', { x: colX.desc, y, size: 8, font: fontBold, color: CINZA_MUTED });
    page.drawText('Setor', { x: colX.setor, y, size: 8, font: fontBold, color: CINZA_MUTED });
    page.drawText('Estoque', { x: colX.qtd, y, size: 8, font: fontBold, color: CINZA_MUTED });
    page.drawText('Valor (custo)', { x: colX.valor, y, size: 8, font: fontBold, color: CINZA_MUTED });
    y -= 6;
    page.drawLine({ start: { x: MARGEM, y }, end: { x: LARGURA_PAGINA - MARGEM, y }, thickness: 0.5, color: CINZA_BORDA });
    y -= 12;
  }

  function desenharCabecalhoTopo() {
    page.drawRectangle({ x: 0, y: ALTURA_PAGINA - 70, width: LARGURA_PAGINA, height: 70, color: AZUL });
    if (logoImg) {
      const escala = 32 / logoImg.height;
      page.drawImage(logoImg, {
        x: MARGEM,
        y: ALTURA_PAGINA - 55,
        width: logoImg.width * escala,
        height: logoImg.height * escala,
      });
    } else {
      page.drawText('IC SUPRA HOSPITALAR', { x: MARGEM, y: ALTURA_PAGINA - 45, size: 14, font: fontBold, color: BRANCO });
    }
    page.drawText('VALOR PARA ESCOAMENTO', {
      x: LARGURA_PAGINA - MARGEM - 190, y: ALTURA_PAGINA - 45, size: 13, font: fontBold, color: BRANCO,
    });
    y = ALTURA_PAGINA - 90;
  }

  function novaPagina() {
    page = pdf.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
    y = ALTURA_PAGINA - MARGEM;
    desenharCabecalhoTopo();
    desenharCabecalhoColunas();
  }

  function garantirEspaco(altura) {
    if (y - altura < MARGEM + 40) novaPagina();
  }

  desenharCabecalhoTopo();

  page.drawText(`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, { x: MARGEM, y, size: 9, font: fontRegular, color: CINZA_MUTED });
  y -= 12;
  page.drawText(
    `Produtos com estoque positivo sem venda registrada nos últimos ${mesesConsiderados} mês(es) importados do Mix de Vendas.`,
    { x: MARGEM, y, size: 9, font: fontRegular, color: CINZA_MUTED }
  );
  y -= 12;
  page.drawText(`${itens.length} produto(s) · Valor total parado: ${fmtMoeda(valorTotal)}`, {
    x: MARGEM, y, size: 10, font: fontBold, color: AZUL,
  });
  y -= 22;

  desenharCabecalhoColunas();

  for (const item of itens) {
    garantirEspaco(16);
    page.drawText(String(item.codigo), { x: colX.codigo, y, size: 8, font: fontRegular, color: CINZA_TEXTO });
    const descCortada = item.descricao.length > 46 ? item.descricao.slice(0, 44) + '…' : item.descricao;
    page.drawText(descCortada, { x: colX.desc, y, size: 8, font: fontRegular, color: CINZA_TEXTO });
    const setorCortado = item.setor.length > 20 ? item.setor.slice(0, 18) + '…' : item.setor;
    page.drawText(setorCortado, { x: colX.setor, y, size: 8, font: fontRegular, color: CINZA_TEXTO });
    page.drawText(String(item.quantidade), { x: colX.qtd, y, size: 8, font: fontRegular, color: CINZA_TEXTO });
    page.drawText(fmtMoeda(item.total), { x: colX.valor, y, size: 8, font: fontRegular, color: CINZA_TEXTO });
    y -= 14;
  }

  garantirEspaco(30);
  y -= 6;
  page.drawLine({ start: { x: MARGEM, y }, end: { x: LARGURA_PAGINA - MARGEM, y }, thickness: 1, color: AZUL });
  y -= 18;
  page.drawText(`VALOR TOTAL PARA ESCOAMENTO: ${fmtMoeda(valorTotal)}`, {
    x: MARGEM, y, size: 12, font: fontBold, color: AZUL,
  });

  return pdf.save();
}
