// Cursed Baker — symbol manifest (all production art, no placeholders)
const ASSET_BASE = 'assets/images';

const SYMBOLS = {
  low_10:      { src: `${ASSET_BASE}/symbols/low/symbol_10.png`, type: 'low' },
  low_j:       { src: `${ASSET_BASE}/symbols/low/symbol_j.png`, type: 'low' },
  low_q:       { src: `${ASSET_BASE}/symbols/low/symbol_q.png`, type: 'low' },
  low_k:       { src: `${ASSET_BASE}/symbols/low/symbol_k.png`, type: 'low' },
  low_a:       { src: `${ASSET_BASE}/symbols/low/symbol_a.png`, type: 'low' },

  prem_baker:  { src: `${ASSET_BASE}/symbols/premium/symbol_baker_portrait.png`, type: 'premium' },
  prem_hat:    { src: `${ASSET_BASE}/symbols/premium/symbol_chef_hat.png`, type: 'premium' },
  prem_cake:   { src: `${ASSET_BASE}/symbols/premium/symbol_cursed_cake.png`, type: 'premium' },
  prem_jar:    { src: `${ASSET_BASE}/symbols/premium/symbol_enchanted_jar.png`, type: 'premium' },
  prem_book:   { src: `${ASSET_BASE}/symbols/premium/symbol_recipe_book.png`, type: 'premium' },
  prem_candle: { src: `${ASSET_BASE}/symbols/premium/symbol_skull_candle.png`, type: 'premium' },

  wild:        { src: `${ASSET_BASE}/symbols/feature/symbol_wild.png`, type: 'wild' },
  scatter:     { src: `${ASSET_BASE}/symbols/feature/symbol_scatter.png`, type: 'scatter' },

  oven_x2:   { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x2.png`, type: 'oven' },
  oven_x3:   { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x3.png`, type: 'oven' },
  oven_x5:   { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x5.png`, type: 'oven' },
  oven_x10:  { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x10.png`, type: 'oven' },
  oven_x25:  { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x25.png`, type: 'oven' },
  oven_x50:  { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x50.png`, type: 'oven' },
  oven_x100: { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x100.png`, type: 'oven' },
  oven_x250: { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x250.png`, type: 'oven' },
  oven_x500: { src: `${ASSET_BASE}/symbols/feature/symbol_oven_x500.png`, type: 'oven' },
};

// 5 columns x 4 rows, row-major — the locked idle reference layout.
const INITIAL_GRID = [
  'prem_cake',  'low_k',      'wild',       'low_q',      'prem_jar',
  'low_a',      'prem_book',  'low_j',      'prem_candle','low_10',
  'scatter',    'low_q',      'prem_hat',   'low_k',      'oven_x5',
  'low_j',      'prem_baker', 'low_a',      'low_10',     'prem_cake',
];

// Pool used for the demo spin (base-game weighting: mostly low/premium, rare feature symbols).
const SPIN_POOL = [
  'low_10','low_10','low_10','low_j','low_j','low_j','low_q','low_q','low_q','low_k','low_k','low_a','low_a',
  'prem_baker','prem_hat','prem_cake','prem_jar','prem_book','prem_candle',
  'wild','scatter',
  'oven_x2','oven_x3','oven_x5','oven_x10','oven_x25',
];
