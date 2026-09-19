export type Theme = {
  isLight?: boolean;
  bg: string;
  bgPanel: string;
  bgSidebar: string;
  bgHover: string;
  bgSelected: string;
  border: string;
  borderMid: string;
  borderAccent: string;
  accent: string;
  accentDim: string;
  accentFaint: string;
  text: string;
  textBright: string;
  textDim: string;
  editorBg: string;
  gutterBg: string;
  lineNum: string;
  success: string;
  warn: string;
  error: string;
};

export type ThemeKey =
  | 'midnight' | 'midnight-light'
  | 'ocean' | 'ocean-light'
  | 'light'
  | 'purple' | 'purple-light'
  | 'green' | 'green-light'
  | 'rose' | 'rose-light'
  | 'amber' | 'amber-light'
  | 'slate' | 'slate-light'
  | 'flat' | 'flat-light'
  | 'coffee' | 'coffee-light'
  | 'cyberpunk' | 'cyberpunk-light'
  | 'retro' | 'retro-light';

export const THEMES: Record<ThemeKey, Theme> = {
  midnight: {
    bg:           '#060d1a',
    bgPanel:      '#09111f',
    bgSidebar:    '#070e1c',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(34,211,238,0.07)',
    border:       'rgba(255,255,255,0.06)',
    borderMid:    'rgba(255,255,255,0.1)',
    borderAccent: 'rgba(34,211,238,0.25)',
    accent:       '#22d3ee',
    accentDim:    'rgba(34,211,238,0.55)',
    accentFaint:  'rgba(34,211,238,0.08)',
    text:         '#94a3b8',
    textBright:   '#e2e8f0',
    textDim:      'rgba(100,116,139,0.8)',
    editorBg:     '#040b16',
    gutterBg:     '#060d1b',
    lineNum:      'rgba(34,211,238,0.18)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.midnight} — same cyan accent, darkened for contrast on a pale cyan-tinted canvas. */
  'midnight-light': {
    isLight: true,
    bg:           '#eef8fb',
    bgPanel:      '#ffffff',
    bgSidebar:    '#e0f2f7',
    bgHover:      'rgba(8,47,73,0.05)',
    bgSelected:   'rgba(14,116,144,0.12)',
    border:       'rgba(8,47,73,0.12)',
    borderMid:    'rgba(8,47,73,0.22)',
    borderAccent: 'rgba(14,116,144,0.45)',
    accent:       '#0e7490',
    accentDim:    '#3596ad',
    accentFaint:  'rgba(14,116,144,0.1)',
    text:         '#164e5c',
    textBright:   '#082f34',
    textDim:      '#4f7c87',
    editorBg:     '#ffffff',
    gutterBg:     '#e6f4f8',
    lineNum:      'rgba(14,116,144,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  ocean: {
    bg:           '#061525',
    bgPanel:      '#0a2035',
    bgSidebar:    '#051220',
    bgHover:      'rgba(50,130,184,0.08)',
    bgSelected:   'rgba(3,246,255,0.08)',
    border:       'rgba(50,130,184,0.15)',
    borderMid:    'rgba(50,130,184,0.25)',
    borderAccent: 'rgba(3,246,255,0.3)',
    accent:       '#03f6ff',
    accentDim:    'rgba(3,246,255,0.6)',
    accentFaint:  'rgba(3,246,255,0.08)',
    text:         '#9dc8e8',
    textBright:   '#daf0ff',
    textDim:      'rgba(100,160,200,0.7)',
    editorBg:     '#040f1c',
    gutterBg:     '#05111e',
    lineNum:      'rgba(3,246,255,0.18)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.ocean} — same sky-blue accent, darkened for contrast on a pale blue-tinted canvas. */
  'ocean-light': {
    isLight: true,
    bg:           '#eaf3fb',
    bgPanel:      '#ffffff',
    bgSidebar:    '#dceaf7',
    bgHover:      'rgba(12,40,70,0.05)',
    bgSelected:   'rgba(2,132,199,0.12)',
    border:       'rgba(12,40,70,0.12)',
    borderMid:    'rgba(12,40,70,0.22)',
    borderAccent: 'rgba(2,132,199,0.45)',
    accent:       '#0369a1',
    accentDim:    '#2f8fc0',
    accentFaint:  'rgba(3,105,161,0.1)',
    text:         '#14425e',
    textBright:   '#08283a',
    textDim:      '#4c7690',
    editorBg:     '#ffffff',
    gutterBg:     '#e2eef9',
    lineNum:      'rgba(3,105,161,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  /**
   * Chocolate: the light half of the brown pair (dark `coffee` is the other).
   * No white anywhere — warm cream panels on a deeper oat canvas with a darker
   * latte sidebar, so the three surfaces still read as distinct layers. Borders
   * are visible hairlines; the accent is a deep mahogany. Every text token is
   * solid hex and clears WCAG AA on the cream panel — including the JSON tree,
   * whose colors switch to a dark set for light themes (see JsonTreeViewer).
   */
  light: {
    isLight: true,
    bg:           '#e6d8bf',
    bgPanel:      '#faf4e8',
    bgSidebar:    '#dcccae',
    bgHover:      'rgba(90,54,30,0.06)',
    bgSelected:   'rgba(124,45,18,0.14)',
    border:       'rgba(60,36,20,0.18)',
    borderMid:    'rgba(60,36,20,0.3)',
    borderAccent: 'rgba(124,45,18,0.55)',
    accent:       '#7c2d12',
    accentDim:    '#96492a',
    accentFaint:  'rgba(124,45,18,0.09)',
    text:         '#382318',
    textBright:   '#1c110b',
    textDim:      '#6a5340',
    editorBg:     '#fdf8ec',
    gutterBg:     '#f0e6d3',
    lineNum:      'rgba(124,45,18,0.4)',
    success:      '#3f6212',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  purple: {
    bg:           '#170f23',
    bgPanel:      '#1f1430',
    bgSidebar:    '#1a1027',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(168,85,247,0.15)',
    border:       'rgba(168,85,247,0.1)',
    borderMid:    'rgba(168,85,247,0.2)',
    borderAccent: 'rgba(168,85,247,0.4)',
    accent:       '#c084fc',
    accentDim:    'rgba(192,132,252,0.55)',
    accentFaint:  'rgba(192,132,252,0.1)',
    text:         '#d8b4fe',
    textBright:   '#f3e8ff',
    textDim:      'rgba(216,180,254,0.6)',
    editorBg:     '#140d1e',
    gutterBg:     '#170f23',
    lineNum:      'rgba(192,132,252,0.3)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.purple} — same violet accent, darkened for contrast on a pale violet-tinted canvas. */
  'purple-light': {
    isLight: true,
    bg:           '#f4eefb',
    bgPanel:      '#ffffff',
    bgSidebar:    '#eadff8',
    bgHover:      'rgba(59,7,100,0.05)',
    bgSelected:   'rgba(147,51,234,0.12)',
    border:       'rgba(59,7,100,0.12)',
    borderMid:    'rgba(59,7,100,0.22)',
    borderAccent: 'rgba(147,51,234,0.45)',
    accent:       '#7e22ce',
    accentDim:    '#9d5bd6',
    accentFaint:  'rgba(126,34,206,0.1)',
    text:         '#4a1772',
    textBright:   '#2c0a47',
    textDim:      '#7c5c98',
    editorBg:     '#ffffff',
    gutterBg:     '#f0e6f9',
    lineNum:      'rgba(126,34,206,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  green: {
    bg:           '#0f1c13',
    bgPanel:      '#132418',
    bgSidebar:    '#111f15',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(52,211,153,0.1)',
    border:       'rgba(52,211,153,0.1)',
    borderMid:    'rgba(52,211,153,0.2)',
    borderAccent: 'rgba(52,211,153,0.4)',
    accent:       '#34d399',
    accentDim:    'rgba(52,211,153,0.55)',
    accentFaint:  'rgba(52,211,153,0.08)',
    text:         '#a7f3d0',
    textBright:   '#ecfdf5',
    textDim:      'rgba(167,243,208,0.6)',
    editorBg:     '#0d1710',
    gutterBg:     '#0f1c13',
    lineNum:      'rgba(52,211,153,0.3)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.green} — same emerald accent, darkened for contrast on a pale green-tinted canvas. */
  'green-light': {
    isLight: true,
    bg:           '#eafbf2',
    bgPanel:      '#ffffff',
    bgSidebar:    '#ddf5e8',
    bgHover:      'rgba(6,58,38,0.05)',
    bgSelected:   'rgba(5,150,105,0.12)',
    border:       'rgba(6,58,38,0.12)',
    borderMid:    'rgba(6,58,38,0.22)',
    borderAccent: 'rgba(5,150,105,0.45)',
    accent:       '#047857',
    accentDim:    '#34987a',
    accentFaint:  'rgba(4,120,87,0.1)',
    text:         '#0e4a34',
    textBright:   '#062c1f',
    textDim:      '#4d7c69',
    editorBg:     '#ffffff',
    gutterBg:     '#e2f7ec',
    lineNum:      'rgba(4,120,87,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  rose: {
    bg:           '#1a0f12',
    bgPanel:      '#231319',
    bgSidebar:    '#160c0f',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(251,113,133,0.12)',
    border:       'rgba(251,113,133,0.1)',
    borderMid:    'rgba(251,113,133,0.2)',
    borderAccent: 'rgba(251,113,133,0.4)',
    accent:       '#fb7185',
    accentDim:    'rgba(251,113,133,0.55)',
    accentFaint:  'rgba(251,113,133,0.08)',
    text:         '#fda4af',
    textBright:   '#fff1f2',
    textDim:      'rgba(253,164,175,0.6)',
    editorBg:     '#130a0d',
    gutterBg:     '#1a0f12',
    lineNum:      'rgba(251,113,133,0.3)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.rose} — same rose accent, darkened for contrast on a pale pink-tinted canvas. */
  'rose-light': {
    isLight: true,
    bg:           '#fdedf0',
    bgPanel:      '#ffffff',
    bgSidebar:    '#fbdfe6',
    bgHover:      'rgba(76,5,25,0.05)',
    bgSelected:   'rgba(225,29,72,0.12)',
    border:       'rgba(76,5,25,0.12)',
    borderMid:    'rgba(76,5,25,0.22)',
    borderAccent: 'rgba(225,29,72,0.45)',
    accent:       '#be123c',
    accentDim:    '#cc5776',
    accentFaint:  'rgba(190,18,60,0.1)',
    text:         '#6b1330',
    textBright:   '#40091d',
    textDim:      '#99566c',
    editorBg:     '#ffffff',
    gutterBg:     '#fce4e9',
    lineNum:      'rgba(190,18,60,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  amber: {
    bg:           '#1a1408',
    bgPanel:      '#22190a',
    bgSidebar:    '#150f05',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(251,191,36,0.1)',
    border:       'rgba(251,191,36,0.1)',
    borderMid:    'rgba(251,191,36,0.2)',
    borderAccent: 'rgba(251,191,36,0.35)',
    accent:       '#fbbf24',
    accentDim:    'rgba(251,191,36,0.55)',
    accentFaint:  'rgba(251,191,36,0.08)',
    text:         '#fde68a',
    textBright:   '#fffbeb',
    textDim:      'rgba(253,230,138,0.6)',
    editorBg:     '#120e05',
    gutterBg:     '#1a1408',
    lineNum:      'rgba(251,191,36,0.3)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.amber} — same gold accent, darkened for contrast on a pale amber-tinted canvas. */
  'amber-light': {
    isLight: true,
    bg:           '#fdf6e6',
    bgPanel:      '#ffffff',
    bgSidebar:    '#faecc9',
    bgHover:      'rgba(69,42,0,0.05)',
    bgSelected:   'rgba(217,119,6,0.12)',
    border:       'rgba(69,42,0,0.12)',
    borderMid:    'rgba(69,42,0,0.22)',
    borderAccent: 'rgba(217,119,6,0.45)',
    accent:       '#b45309',
    accentDim:    '#c17d3f',
    accentFaint:  'rgba(180,83,9,0.1)',
    text:         '#6b4310',
    textBright:   '#402808',
    textDim:      '#98805a',
    editorBg:     '#ffffff',
    gutterBg:     '#f8eed4',
    lineNum:      'rgba(180,83,9,0.4)',
    success:      '#15803d',
    warn:         '#9a3412',
    error:        '#b91c1c',
  },
  slate: {
    bg:           '#0d1117',
    bgPanel:      '#161b22',
    bgSidebar:    '#0d1117',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(148,163,184,0.1)',
    border:       'rgba(148,163,184,0.08)',
    borderMid:    'rgba(148,163,184,0.15)',
    borderAccent: 'rgba(148,163,184,0.3)',
    accent:       '#94a3b8',
    accentDim:    'rgba(148,163,184,0.55)',
    accentFaint:  'rgba(148,163,184,0.08)',
    text:         '#cbd5e1',
    textBright:   '#f1f5f9',
    textDim:      'rgba(148,163,184,0.6)',
    editorBg:     '#090d12',
    gutterBg:     '#0d1117',
    lineNum:      'rgba(148,163,184,0.25)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.slate} — same neutral gray-blue accent on a pale neutral canvas. */
  'slate-light': {
    isLight: true,
    bg:           '#f4f5f7',
    bgPanel:      '#ffffff',
    bgSidebar:    '#e9ebee',
    bgHover:      'rgba(15,23,42,0.04)',
    bgSelected:   'rgba(71,85,105,0.1)',
    border:       'rgba(15,23,42,0.1)',
    borderMid:    'rgba(15,23,42,0.18)',
    borderAccent: 'rgba(71,85,105,0.35)',
    accent:       '#475569',
    accentDim:    '#64748b',
    accentFaint:  'rgba(71,85,105,0.08)',
    text:         '#334155',
    textBright:   '#0f172a',
    textDim:      '#64748b',
    editorBg:     '#ffffff',
    gutterBg:     '#eef0f2',
    lineNum:      'rgba(71,85,105,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  /**
   * Sunset: warm dusk theme — a coral-orange accent over deep charcoal-brown
   * panels, with sand-toned text. Occupies the orange slot between Amber's
   * yellow-gold and Rose's pink, and keeps the shared status hues so success /
   * warn / error stay legible against the accent.
   *
   * Replaced the former poster-style light "flat" theme; the `flat` key is kept
   * so stored selections, test ids and `env` snapshots carry over.
   */
  flat: {
    bg:           '#1c1410',
    bgPanel:      '#241a14',
    bgSidebar:    '#181009',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(255,122,89,0.13)',
    border:       'rgba(255,122,89,0.1)',
    borderMid:    'rgba(255,122,89,0.2)',
    borderAccent: 'rgba(255,122,89,0.4)',
    accent:       '#ff7a59',
    accentDim:    'rgba(255,122,89,0.55)',
    accentFaint:  'rgba(255,122,89,0.08)',
    text:         '#e7c9b3',
    textBright:   '#fff2e8',
    textDim:      'rgba(231,201,179,0.6)',
    editorBg:     '#160f0a',
    gutterBg:     '#1c1410',
    lineNum:      'rgba(255,122,89,0.3)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.flat} — same coral accent, darkened for contrast on a pale peach canvas. */
  'flat-light': {
    isLight: true,
    bg:           '#fef1eb',
    bgPanel:      '#ffffff',
    bgSidebar:    '#fce1d5',
    bgHover:      'rgba(87,26,8,0.05)',
    bgSelected:   'rgba(234,88,53,0.12)',
    border:       'rgba(87,26,8,0.12)',
    borderMid:    'rgba(87,26,8,0.22)',
    borderAccent: 'rgba(234,88,53,0.45)',
    accent:       '#c2410c',
    accentDim:    '#d97347',
    accentFaint:  'rgba(194,65,12,0.1)',
    text:         '#7c2d0e',
    textBright:   '#4a1a08',
    textDim:      '#a8765c',
    editorBg:     '#ffffff',
    gutterBg:     '#fbe6da',
    lineNum:      'rgba(194,65,12,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  coffee: {
    bg:           '#1b120c',
    bgPanel:      '#241a12',
    bgSidebar:    '#170f0a',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(198,137,88,0.12)',
    border:       'rgba(198,137,88,0.1)',
    borderMid:    'rgba(198,137,88,0.2)',
    borderAccent: 'rgba(198,137,88,0.4)',
    accent:       '#c68958',
    accentDim:    'rgba(198,137,88,0.55)',
    accentFaint:  'rgba(198,137,88,0.08)',
    text:         '#d9b99a',
    textBright:   '#f5e6d3',
    textDim:      'rgba(217,185,154,0.6)',
    editorBg:     '#140d08',
    gutterBg:     '#1b120c',
    lineNum:      'rgba(198,137,88,0.3)',
    success:      '#10b981',
    warn:         '#f59e0b',
    error:        '#ef4444',
  },
  /** Light counterpart of {@link THEMES.coffee} — same tan accent, deepened to a caramel for contrast on a pale cream canvas. */
  'coffee-light': {
    isLight: true,
    bg:           '#f7ede1',
    bgPanel:      '#fffaf3',
    bgSidebar:    '#efdfc9',
    bgHover:      'rgba(59,32,10,0.05)',
    bgSelected:   'rgba(146,96,58,0.14)',
    border:       'rgba(59,32,10,0.14)',
    borderMid:    'rgba(59,32,10,0.24)',
    borderAccent: 'rgba(146,96,58,0.45)',
    accent:       '#92603a',
    accentDim:    '#a97c54',
    accentFaint:  'rgba(146,96,58,0.1)',
    text:         '#4a3018',
    textBright:   '#2a1a0c',
    textDim:      '#7c5f42',
    editorBg:     '#fffaf3',
    gutterBg:     '#f1e2cc',
    lineNum:      'rgba(146,96,58,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  /**
   * Cyberpunk: hot-magenta neon on a blue-black canvas with cyan-tinted text.
   * The canvas is deliberately blue rather than violet — a violet canvas
   * with a magenta accent collapses into Amethyst — and the status colors
   * are pushed to neon (mint / yellow / hot red) to match.
   */
  cyberpunk: {
    bg:           '#050810',
    bgPanel:      '#0b101c',
    bgSidebar:    '#03050b',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(255,43,214,0.12)',
    border:       'rgba(255,43,214,0.12)',
    borderMid:    'rgba(255,43,214,0.22)',
    borderAccent: 'rgba(255,43,214,0.45)',
    accent:       '#ff2bd6',
    accentDim:    'rgba(255,43,214,0.55)',
    accentFaint:  'rgba(255,43,214,0.08)',
    text:         '#8fd8e6',
    textBright:   '#e8fbff',
    textDim:      'rgba(143,216,230,0.6)',
    editorBg:     '#03050b',
    gutterBg:     '#050810',
    lineNum:      'rgba(255,43,214,0.3)',
    success:      '#2ee6a6',
    warn:         '#ffd23f',
    error:        '#ff3b5c',
  },
  /** Light counterpart of {@link THEMES.cyberpunk} — same magenta accent, deepened for contrast on a cool blue-grey canvas with teal-slate text. */
  'cyberpunk-light': {
    isLight: true,
    bg:           '#eef4f8',
    bgPanel:      '#ffffff',
    bgSidebar:    '#dfe9f1',
    bgHover:      'rgba(10,40,55,0.05)',
    bgSelected:   'rgba(194,16,156,0.12)',
    border:       'rgba(10,40,55,0.12)',
    borderMid:    'rgba(10,40,55,0.22)',
    borderAccent: 'rgba(194,16,156,0.45)',
    accent:       '#c2109c',
    accentDim:    '#d055b7',
    accentFaint:  'rgba(194,16,156,0.1)',
    text:         '#123a47',
    textBright:   '#07222c',
    textDim:      '#4f7683',
    editorBg:     '#ffffff',
    gutterBg:     '#e4edf4',
    lineNum:      'rgba(194,16,156,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
  /**
   * Retro: seventies mustard on deep teal. Cream-leaning text keeps the
   * canvas warm rather than reading as another blue-green dark theme.
   */
  retro: {
    bg:           '#0f2321',
    bgPanel:      '#163331',
    bgSidebar:    '#0b1c1a',
    bgHover:      'rgba(255,255,255,0.03)',
    bgSelected:   'rgba(217,164,65,0.13)',
    border:       'rgba(217,164,65,0.12)',
    borderMid:    'rgba(217,164,65,0.22)',
    borderAccent: 'rgba(217,164,65,0.42)',
    accent:       '#d9a441',
    accentDim:    'rgba(217,164,65,0.55)',
    accentFaint:  'rgba(217,164,65,0.08)',
    text:         '#d8cbb0',
    textBright:   '#f8f1e0',
    textDim:      'rgba(216,203,176,0.6)',
    editorBg:     '#0b1b19',
    gutterBg:     '#0f2321',
    lineNum:      'rgba(217,164,65,0.3)',
    success:      '#4ade80',
    warn:         '#f59e0b',
    error:        '#f87171',
  },
  /** Light counterpart of {@link THEMES.retro} — same mustard accent, deepened to an ochre for contrast on an aged-paper cream canvas. */
  'retro-light': {
    isLight: true,
    bg:           '#f5eed8',
    bgPanel:      '#fffaea',
    bgSidebar:    '#ebe1c2',
    bgHover:      'rgba(58,44,10,0.05)',
    bgSelected:   'rgba(154,107,11,0.14)',
    border:       'rgba(58,44,10,0.14)',
    borderMid:    'rgba(58,44,10,0.24)',
    borderAccent: 'rgba(154,107,11,0.45)',
    accent:       '#9a6b0b',
    accentDim:    '#b28a3b',
    accentFaint:  'rgba(154,107,11,0.1)',
    text:         '#463514',
    textBright:   '#2a1f08',
    textDim:      '#7d6a42',
    editorBg:     '#fffaea',
    gutterBg:     '#efe5c9',
    lineNum:      'rgba(154,107,11,0.4)',
    success:      '#15803d',
    warn:         '#b45309',
    error:        '#b91c1c',
  },
};

export const METHOD_CLR: Record<string, string> = {
  GET:     '#22d3ee',
  POST:    '#10b981',
  PUT:     '#f59e0b',
  PATCH:   '#a78bfa',
  DELETE:  '#ef4444',
  OPTIONS: '#6366f1',
  HEAD:    '#64748b',
  SSE:     '#f472b6',
  WS:      '#38bdf8',
  IO:      '#fb923c',
  PGSQL:   '#a3e635',
  DOCS:    '#a78bfa',
};

/**
 * Same hues, seated for light surfaces. The 400/500-level set above is tuned for
 * dark panels and drops to ~2:1 on white (GET cyan is the worst offender), so
 * light themes get the 700-level equivalents instead. All clear AA on white.
 */
export const METHOD_CLR_LIGHT: Record<string, string> = {
  GET:     '#0e7490',
  POST:    '#047857',
  PUT:     '#b45309',
  PATCH:   '#6d28d9',
  DELETE:  '#b91c1c',
  OPTIONS: '#4338ca',
  HEAD:    '#475569',
  SSE:     '#be185d',
  WS:      '#0369a1',
  IO:      '#c2410c',
  PGSQL:   '#4d7c0f',
  DOCS:    '#6d28d9',
};

export const STATUS_TXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

export function statusColor(code: number | null, T: Theme): string {
  if (!code) return '#64748b';
  if (code < 300) return T.success;
  if (code < 400) return T.warn;
  return T.error;
}

/**
 * HTTP-method label color for the active theme. The dark palette's 400/500-level
 * hues drop to ~1.5:1 on a pale surface, so light themes get the 700-level set
 * ({@link METHOD_CLR_LIGHT}) instead. Falls back to dim text for unknown verbs.
 */
export function methodColor(method: string, T: Theme): string {
  const set = T.isLight ? METHOD_CLR_LIGHT : METHOD_CLR;
  return set[method.toUpperCase()] ?? T.textDim;
}

/**
 * Single source of truth for turning a Theme into CSS custom properties.
 *
 * Every visual token the app uses is published as `--app-*` so components can
 * style with real CSS (Tailwind utilities, `:hover`, `:focus-visible`) instead
 * of prop-drilled inline styles. `globals.css` maps these onto Tailwind's
 * `app-*` color namespace, so `bg-app-panel` / `text-app-dim` / `border-app-border`
 * all resolve to the active theme with no JS involved.
 */
export function themeVars(T: Theme): Record<string, string> {
  return {
    '--app-bg': T.bg,
    '--app-panel': T.bgPanel,
    '--app-sidebar': T.bgSidebar,
    '--app-hover': T.bgHover,
    '--app-selected': T.bgSelected,
    '--app-border': T.border,
    '--app-border-mid': T.borderMid,
    '--app-border-accent': T.borderAccent,
    '--app-accent': T.accent,
    '--app-accent-dim': T.accentDim,
    '--app-accent-faint': T.accentFaint,
    '--app-text': T.text,
    '--app-bright': T.textBright,
    '--app-dim': T.textDim,
    '--app-editor': T.editorBg,
    '--app-gutter': T.gutterBg,
    '--app-line-num': T.lineNum,
    '--app-success': T.success,
    '--app-warn': T.warn,
    '--app-error': T.error,
    '--app-on-solid': T.isLight ? '#ffffff' : T.bg,
    ...methodVars(T),
  };
}

/** Per-method color tokens (`--method-get`, `--method-post`, ...). */
function methodVars(T: Theme): Record<string, string> {
  const set = T.isLight ? METHOD_CLR_LIGHT : METHOD_CLR;
  return Object.fromEntries(
    Object.entries(set).map(([method, color]) => [`--method-${method.toLowerCase()}`, color]),
  );
}
