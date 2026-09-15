// Tokens de marca — mesma paleta usada nos documentos da IC Supra Hospitalar
// (Aprovação de Promoção, ROI Tráfego Pago). Mantém consistência visual entre
// todos os materiais gerados pela consultoria.

export const colors = {
  azul: '#0C3D6E',        // cor primária de marca
  azulClaro: '#E6F1FB',
  azulHover: '#185FA5',
  verde: '#1A7A4A',
  verdeClaro: '#E8F5EE',
  cinza: '#F5F6F8',
  cinzaBorda: '#E2E5EA',
  texto: '#1A1A2E',
  muted: '#6B7280',
  laranja: '#F97316',
  laranjaClaro: '#FFF7ED',
  vermelho: '#991B1B',
  vermelhoClaro: '#FEE2E2',
  amarelo: '#92400E',
  amareloClaro: '#FFFBEB',
  roxo: '#7C3AED',
  roxoClaro: '#F3E8FF',
  branco: '#FFFFFF',
};

// Níveis de alerta de compra — cor + rótulo + prioridade de ordenação
export const alertLevels = {
  CRITICO: { label: 'Crítico', cor: colors.vermelho, fundo: colors.vermelhoClaro, ordem: 0 },
  ATENCAO: { label: 'Atenção', cor: colors.amarelo, fundo: colors.amareloClaro, ordem: 1 },
  RUPTURA: { label: 'Ruptura (zerado)', cor: '#4B0082', fundo: '#F3E8FF', ordem: -1 },
  NEGATIVO: { label: 'Estoque negativo', cor: colors.branco, fundo: '#7C2D12', ordem: -2 },
  MONITORAR: { label: 'Monitorar', cor: colors.azul, fundo: colors.azulClaro, ordem: 2 },
  OK: { label: 'OK', cor: colors.verde, fundo: colors.verdeClaro, ordem: 3 },
};
