// Classifica um produto em um setor com base em palavras-chave da descrição.
// É uma inferência — sempre pode ser sobrescrita manualmente por produto
// (campo `setor` em configProdutos.js), guardando a preferência do usuário.
//
// A ordem das regras importa: a primeira que bater vence. Termos mais
// específicos (ex: "colostomia") vêm antes de termos genéricos (ex: "bolsa").

export const SETORES = [
  'Ortopédicos',
  'Mobilidade',
  'Curativos e Feridas',
  'Respiratório',
  'Descartáveis e Consumo',
  'Diagnóstico',
  'Ostomia',
  'Instrumental Cirúrgico',
  'Enxoval e Higiene',
  'Farmácia/Medicamentos',
  'Odontológico',
  'Outros',
];

const REGRAS = [
  { setor: 'Ostomia', termos: ['colostomia', 'ostomia', 'bolsa colet'] },
  { setor: 'Respiratório', termos: ['cpap', 'nebuliza', 'oxig', 'traqueal', 'traqueo', 'umidificador', 'aspirador', 'mascara oro-nasal', 'mascara nasal', 'cânula', 'canula', 'respiron'] },
  { setor: 'Curativos e Feridas', termos: ['curativo', 'gaze', 'atadura', 'esparadrapo', 'micropor', 'alginato', 'hidrocoloide', 'hidrogel', 'espuma sacral', 'fita adesiva', 'fita cirurg'] },
  { setor: 'Diagnóstico', termos: ['esfigmoman', 'estetosc', 'oximetro', 'termometro', 'glicose', 'glicemia', 'lanceta', 'balanca', 'otoscopio'] },
  { setor: 'Instrumental Cirúrgico', termos: ['pinca', 'tesoura', 'porta agulha', 'cabo para bisturi', 'lamina de bisturi', 'lamina bisturi', 'campo oper', 'avental cirur'] },
  { setor: 'Ortopédicos', termos: ['joelheira', 'tornozeleira', 'colar cervical', 'tala ', 'imobilizador', 'ortese', 'orteses', 'colete', 'muleta', 'bengala', 'tipoia', 'munhequeira', 'cotoveleira', 'espaldeira', 'faixa abdominal', 'faixa toracica', 'corretor postural', 'venosan', 'meia de compress'] },
  { setor: 'Mobilidade', termos: ['cadeira de rodas', 'cadeira higien', 'cadeira de banho', 'andador', 'assento sanitario', 'suporte p/soro', 'maca'] },
  { setor: 'Descartáveis e Consumo', termos: ['seringa', 'agulha', 'luva', 'sonda', 'scalp', 'cateter', 'equipo', 'soro fisio', 'algodao', 'alcool', 'mascara descartavel', 'mascara kn95', 'touca desc', 'propé', 'sapatilha'] },
  { setor: 'Enxoval e Higiene', termos: ['lencol', 'fralda', 'papel toalha', 'toalha', 'capa hosp', 'colchao', 'travesseiro', 'coxim'] },
  // Catálogo legado que aparece quase inteiro no relatório "zerado" — não é
  // o core de produtos ortopédicos/hospitalares da IC Supra, mas precisa de
  // um lugar próprio em vez de cair em "Outros".
  { setor: 'Farmácia/Medicamentos', termos: [
    'dipirona', 'paracetamol', 'dexametasona', 'omeprazol', 'losartana', 'metronidazol',
    'nimesulida', 'nimesulide', 'amitriptilina', 'bromazepam', 'clonazepam', 'diazepam',
    'alprazolam', 'carvedilol', 'amoxicilina', 'azitromicina', 'cetoconazol', 'nifedipina',
    'naloxona', 'nistatina', 'pantoprazol', 'metformina', 'secnidazol', 'lidocaina',
    'heparina', 'soro fisiologico', 'manitol', 'cloreto de sodio', 'agua para injecao',
    'agua p/ injetaveis', 'sertralina', 'ácido valproico', 'acido valproico', 'carbonato de litio',
  ] },
  { setor: 'Odontológico', termos: [
    'broca', 'resina', 'lima endo', 'lima k', 'cureta', 'catgut', 'cimento odont',
    'espatula odont', 'dique de borracha', 'moldeira', 'alginato odont', 'brunidor',
  ] },
];

// Rede de segurança para medicamentos que não bateram com nenhum nome específico
// acima: dosagem em MG/MCG/UI é um padrão quase exclusivo de fármaco (produtos
// hospitalares em geral usam CM/MM/ML/KG para tamanho, não essas unidades).
const REGEX_DOSAGEM_FARMACO = /\d+\s?(mg|mcg|ui)\b/i;

export function inferirSetor(descricao) {
  const d = descricao.toLowerCase();
  for (const regra of REGRAS) {
    if (regra.termos.some((termo) => d.includes(termo))) return regra.setor;
  }
  if (REGEX_DOSAGEM_FARMACO.test(d)) return 'Farmácia/Medicamentos';
  return 'Outros';
}
