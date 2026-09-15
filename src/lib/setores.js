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
  'Beleza & Estética',
  'Outros',
];

// Setores que NUNCA podem ser marcados como descontinuados, mesmo em lote —
// são core do negócio (Instrumental Cirúrgico) independentemente de estarem
// zerados ou sem giro cadastrado. A ação "marcar setor como descontinuado"
// (ver PainelAlertas.jsx) nem oferece o botão para esses setores.
export const SETORES_NAO_DESCONTINUAVEIS = ['Instrumental Cirúrgico'];

// Setores segregados que exigem uma decisão de negócio antes de entrar num
// pedido de compra (ex: catálogo de beleza/estética herdado de outro
// sistema) — mas que NÃO são tratados como descontinuados automaticamente:
// continuam gerando alerta normal de Ruptura/Crítico/etc. Só ficam marcados
// com uma etiqueta visual pra quem for montar a ordem de compra.
export const SETORES_FLAG_GESTAO = ['Beleza & Estética'];

const REGRAS = [
  { setor: 'Ostomia', termos: ['colostomia', 'ostomia', 'bolsa colet'] },
  { setor: 'Respiratório', termos: ['cpap', 'nebuliza', 'oxig', 'traqueal', 'traqueo', 'umidificador', 'aspirador', 'mascara oro-nasal', 'mascara nasal', 'cânula', 'canula', 'respiron'] },
  { setor: 'Curativos e Feridas', termos: ['curativo', 'gaze', 'atadura', 'esparadrapo', 'micropor', 'alginato', 'hidrocoloide', 'hidrogel', 'espuma sacral', 'fita adesiva', 'fita cirurg'] },
  { setor: 'Diagnóstico', termos: ['esfigmoman', 'estetosc', 'oximetro', 'termometro', 'glicose', 'glicemia', 'lanceta', 'balanca', 'otoscopio'] },
  { setor: 'Instrumental Cirúrgico', termos: ['pinca', 'tesoura', 'porta agulha', 'cabo para bisturi', 'lamina de bisturi', 'lamina bisturi', 'campo oper', 'avental cirur'] },
  { setor: 'Ortopédicos', termos: ['joelheira', 'tornozeleira', 'colar cervical', 'tala ', 'imobilizador', 'ortese', 'orteses', 'colete', 'muleta', 'bengala', 'tipoia', 'munhequeira', 'cotoveleira', 'espaldeira', 'faixa abdominal', 'faixa toracica', 'corretor postural', 'venosan', 'meia de compress', 'meia compress', 'comfortline', 'ultraline', 'utraline', 'legline', 'supportline', 'silverline'] },
  // "maca" sozinho pegaria qualquer palavra com "-mação/-macao" sem acento
  // (FORMACAO, AUTOMACAO, DEGERMACAO), "MACARRAO" e "MACACAO" (macacão de
  // proteção), além de "VINAGRE MACA" (maçã sem acento, produto capilar) —
  // por isso a maca (equipamento) usa só as formas compostas reais do
  // catálogo em vez do termo isolado.
  { setor: 'Mobilidade', termos: ['cadeira de rodas', 'cadeira higien', 'cadeira de banho', 'andador', 'assento sanitario', 'suporte p/soro', 'maca inox', 'maca retratil', 'maca tipo sked', 'maca de qualidade', 'maca p/massagem', 'maca/diva', 'diva maca', 'carro maca', 'p/ maca', 'p/maca'] },
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
  // Catálogo legado de beleza/cuidado capilar (herança de outro sistema) —
  // segregado num setor próprio em vez de "vazar" pra Outros ou (pior) ser
  // confundido com produto hospitalar. Cada termo abaixo foi validado contra
  // o catálogo real (10 mil itens) antes de entrar aqui — termos genéricos
  // que colidiram com produtos hospitalares/eletrodomésticos foram
  // descartados ou trocados por uma forma mais específica:
  //  - "corretivo" sozinho pegaria "CORRETIVO PARA JOANETE" (ortopédico) →
  //    usamos "corretivo liquido".
  //  - "condicionador" sozinho pegaria "CONDICIONADORES DE AR" e "ACIDO
  //    CONDICIONADOR" (material odontológico) → usamos as marcas
  //    específicas encontradas no catálogo.
  //  - "esmalte" sozinho só pegava eletrodomésticos (marca Esmaltec) e
  //    "resina... ESMALTE" (odontológico) — nenhum produto de unha real no
  //    catálogo hoje, então foi descartado (não incluir termo sem exemplo real).
  //  - "prancha"/"secador" sozinhos pegavam prancha de resgate (maca) —
  //    trocado pela marca "taiff", que cobre os itens reais sem esse risco.
  //  - "shampoo"/"xampu" sozinhos pegariam shampoo medicamentoso (ex:
  //    cetoconazol) já classificado em Farmácia — não incluídos.
  //  - "tinta"/"tintas" isolados: sem exemplo confirmado no catálogo atual,
  //    tratar como candidato a validar depois, não incluir direto.
  //  - "hair" pega a linha "SOFT HAIR" (leave-in, defriz, removedor de
  //    mancha) — validado sem colisão com nenhum produto hospitalar.
  { setor: 'Beleza & Estética', termos: [
    'babyliss', 'taiff', 'tintura', 'koleston', 'coloracao', 'coloração', 'hair',
    'corretivo liquido', 'corretivo líquido', 'maquiagem',
    'condicionador alyne', 'condicionador balsamo',
    // termos sem ocorrência no catálogo testado hoje, mas sem risco de
    // colisão identificado — mantidos para cobrir importações futuras:
    'escova progressiva', 'chapinha', 'base facial', 'po compacto', 'pó compacto',
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
