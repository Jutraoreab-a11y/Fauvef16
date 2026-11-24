// Donnees du prototype : bases modulaires, zones, matieres et vocabulaire du copilote.
const BASES = {
  apparel: {
    name: 'Gilet zippé',
    zones: [
      { id: 'manches', label: 'Épaules / manches', hex: '#1E2630', material: 'molleton' },
      { id: 'corps', label: 'Corps', hex: '#1E2630', material: 'molleton' },
      { id: 'col', label: 'Col', hex: '#2A3542', material: 'maille épaisse' },
      { id: 'bords', label: 'Bords-côtes', hex: '#E4E1DA', material: 'maille épaisse' },
      { id: 'zip', label: 'Zip', hex: '#9AA3AD', material: 'métal' },
      { id: 'poches', label: 'Poches plaquées', hex: '#1E2630', material: 'molleton' },
      { id: 'boutons', label: 'Boutons et pressions', hex: '#C9C3B6', material: 'métal' },
      { id: 'couture', label: 'Coutures apparentes', hex: '#2A2A2A', material: 'coton lourd' }
    ],
    sliders: [
      { id: 'boxy', label: 'Ampleur', min: 0, max: 100, value: 40 },
      { id: 'longueur', label: 'Longueur', min: 0, max: 100, value: 55 },
      { id: 'col_hauteur', label: 'Hauteur du col', min: 0, max: 100, value: 30 }
    ],
    specs: [
      ['Tailles', 'S / M / L / XL'],
      ['Fermeture', 'Zip central'],
      ['Matière de référence', 'Molleton 320 g/m²']
    ]
  },
  gear: {
    name: 'Gant de boxe',
    zones: [
      { id: 'coque', label: 'Coque de frappe', hex: '#15171A', material: 'cuir mat' },
      { id: 'pouce', label: 'Pouce', hex: '#B3261E', material: 'cuir mat' },
      { id: 'paume', label: 'Paume', hex: '#2A2D33', material: 'microfibre haute densité' },
      { id: 'manchette', label: 'Manchette', hex: '#EDEBE6', material: 'cuir brillant' },
      { id: 'scratch', label: 'Scratch de fermeture', hex: '#2A2D33', material: 'microfibre haute densité' },
      { id: 'couture', label: 'Coutures apparentes', hex: '#2A2A2A', material: 'coton lourd' }
    ],
    sliders: [
      { id: 'rembourrage', label: 'Rembourrage', min: 0, max: 100, value: 50 },
      { id: 'longueur_manchette', label: 'Longueur de la manchette', min: 0, max: 100, value: 45 }
    ],
    specs: [
      ['Poids', '12 oz / 14 oz / 16 oz'],
      ['Rembourrage', 'Mousse multicouche'],
      ['Fermeture', 'Scratch poignet']
    ]
  }
};

const MATERIALS = ['molleton', 'maille épaisse', 'coton lourd', 'cuir mat', 'cuir brillant', 'microfibre haute densité', 'métal'];

const COLORS = [
  ['noir mat', '#15171A'], ['blanc cassé', '#E4E1DA'], ['noir', '#101113'], ['blanc', '#EDEBE6'],
  ['rouge', '#B3261E'], ['bleu marine', '#14213D'], ['bleu', '#1F4E9A'], ['gris', '#6B7280'],
  ['beige', '#C8B89A'], ['vert', '#2F5D46'], ['orange', '#D9622B']
];

const ZONE_ALIASES = {
  manches: ['manches', 'épaules', 'epaules'],
  corps: ['corps'],
  col: ['col'],
  bords: ['bords-côtes', 'bords cotes', 'bords', 'ourlet'],
  zip: ['zip', 'fermeture'],
  poches: ['poche', 'poches'],
  boutons: ['bouton', 'boutons', 'pression', 'pressions'],
  couture: ['couture', 'coutures'],
  scratch: ['scratch', 'velcro'],
  coque: ['coque'],
  pouce: ['pouce'],
  paume: ['paume'],
  manchette: ['manchette', 'poignet']
};

const MATERIAL_TERMS = [
  ['cuir brillant', 'cuir brillant'], ['cuir mat', 'cuir mat'], ['cuir', 'cuir mat'],
  ['molleton', 'molleton'], ['maille épaisse', 'maille épaisse'],
  ['coton lourd', 'coton lourd'], ['microfibre', 'microfibre haute densité']
];

const KEYWORDS = [
  ['patch', 'patch'], ['logo', 'patch'], ['broderie', 'patch'], ['étiquette', 'patch'],
  ['boxy', 'boxy'], ['plus ample', 'boxy'],
  ['remonte', 'raise'], ['relève', 'raise'],
  ['rembourrage', 'pad'], ['rembourré', 'pad']
];
