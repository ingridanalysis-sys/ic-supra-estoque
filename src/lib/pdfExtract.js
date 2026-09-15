import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extrai o texto de um arquivo PDF (File/Blob), reagrupando os itens de texto
 * em linhas com base na coordenada Y — necessário porque o pdf.js entrega os
 * itens de texto meio soltos e a ordem/agrupamento por linha visual importa
 * para o parser de estoque (colunas fixas por relatório).
 */
export async function extrairTextoPdf(arquivo, onProgress) {
  const buffer = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const linhasTotais = [];

  for (let pagina = 1; pagina <= pdf.numPages; pagina += 1) {
    const page = await pdf.getPage(pagina);
    const conteudo = await page.getTextContent();

    // Agrupa itens por linha (mesma coordenada Y, com tolerância)
    const porLinha = new Map();
    for (const item of conteudo.items) {
      const y = Math.round(item.transform[5]);
      // tolerância de 2px para variações de sub-pixel dentro da mesma linha visual
      const chaveExistente = Array.from(porLinha.keys()).find((k) => Math.abs(k - y) <= 2);
      const chave = chaveExistente ?? y;
      if (!porLinha.has(chave)) porLinha.set(chave, []);
      porLinha.get(chave).push(item);
    }

    // Ordena linhas de cima para baixo (Y maior = mais acima no PDF) e,
    // dentro de cada linha, da esquerda para a direita (X crescente)
    const linhasOrdenadas = Array.from(porLinha.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, itens]) =>
        itens
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map((i) => i.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean);

    linhasTotais.push(...linhasOrdenadas);
    if (onProgress) onProgress(pagina, pdf.numPages);
  }

  return linhasTotais.join('\n');
}
