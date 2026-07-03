/**
 * Boundary contract tests: fill engine ↔ UI layer.
 *
 * Tests the behavior guaranteed at the boundary (propagateConstraints, entropy
 * calculation, word viability) without exercising the Web Worker itself.
 */

import { propagateConstraints } from '../fillEngine';

// ---------------------------------------------------------------------------
// Grid and word-list fixtures (same as fillEngine.test.ts)
// ---------------------------------------------------------------------------

const size = 4;
const twoCorners: boolean[][] = [
  [true,  false, false, false],
  [false, false, false, false],
  [false, false, false, false],
  [false, false, false, true ],
];

const wordList3 = [
  'cat', 'car', 'cab', 'bat', 'bar', 'tab', 'tar', 'arc', 'ace', 'ape', 'tea',
  'ate', 'eat', 'era', 'ear', 'are', 'age', 'ago', 'aid', 'aim', 'air', 'act',
  'ash', 'ask', 'bag', 'bad', 'bed', 'bee', 'bit', 'boa', 'boy', 'bud', 'bug',
  'bus', 'but', 'buy', 'can', 'cap', 'cot', 'cow', 'cry', 'cub', 'cup', 'cut',
  'dad', 'day', 'den', 'did', 'die', 'dig', 'dim', 'dip', 'dog', 'dot', 'dry',
  'fan', 'far', 'fat', 'fed', 'fee', 'few', 'fig', 'fin', 'fir', 'fit', 'fix',
  'fly', 'foe', 'fog', 'for', 'fox', 'fun', 'fur', 'gap', 'gas', 'gem', 'get',
  'gun', 'gut', 'had', 'ham', 'hat', 'her', 'him', 'his', 'hit', 'hop', 'hot',
  'how', 'hug', 'hum', 'hut', 'ice', 'ill', 'ink', 'ion', 'ire', 'ivy', 'jam',
  'jar', 'jaw', 'jet', 'job', 'jog', 'joy', 'jug', 'key', 'kid', 'kit', 'lab',
  'lap', 'law', 'lay', 'led', 'leg', 'let', 'lid', 'lie', 'lip', 'log', 'lot',
  'low', 'mad', 'man', 'map', 'mat', 'may', 'men', 'met', 'mix', 'mob', 'mom',
  'mop', 'mud', 'mug', 'nap', 'net', 'new', 'nod', 'not', 'now', 'nut', 'oar',
  'odd', 'oil', 'old', 'one', 'ore', 'our', 'out', 'owl', 'own', 'pad', 'pan',
  'pat', 'paw', 'pay', 'pea', 'pen', 'pet', 'pie', 'pig', 'pin', 'pit', 'pod',
  'pop', 'pot', 'pub', 'pun', 'put', 'ram', 'ran', 'rap', 'rat', 'raw', 'ray',
  'red', 'rib', 'rid', 'rim', 'rip', 'rob', 'rod', 'rot', 'row', 'rub', 'rug',
  'run', 'rye', 'sad', 'sap', 'sat', 'saw', 'say', 'sea', 'see', 'set', 'sew',
  'sin', 'sip', 'sit', 'six', 'ski', 'sky', 'sob', 'son', 'sow', 'soy', 'spy',
  'sub', 'sue', 'sum', 'sun', 'tag', 'tan', 'tap', 'tax', 'ten', 'tie', 'tin',
  'tip', 'toe', 'ton', 'top', 'toy', 'try', 'tub', 'tug', 'two', 'urn', 'use',
  'van', 'vat', 'vet', 'via', 'vie', 'vow', 'wad', 'war', 'was', 'wax', 'way',
  'web', 'wed', 'wee', 'wet', 'wig', 'win', 'wit', 'woe', 'won', 'woo', 'wow',
  'yak', 'yap', 'yaw', 'yea', 'yen', 'yes', 'yet', 'you', 'zap', 'zip', 'zoo',
];
const wordList4 = [
  'able', 'acid', 'aged', 'also', 'area', 'army', 'away', 'baby', 'back', 'ball',
  'band', 'bank', 'base', 'bath', 'bear', 'beat', 'been', 'bell', 'best', 'bill',
  'bird', 'blow', 'blue', 'boat', 'body', 'bond', 'bone', 'book', 'boom', 'born',
  'both', 'bulk', 'burn', 'busy', 'cake', 'call', 'calm', 'came', 'card', 'care',
  'case', 'cash', 'cast', 'cave', 'cell', 'chat', 'chip', 'city', 'coat', 'code',
  'cold', 'come', 'cook', 'cool', 'cope', 'copy', 'core', 'corn', 'cost', 'crew',
  'crop', 'cure', 'dark', 'data', 'date', 'dawn', 'dead', 'deal', 'dear', 'debt',
  'deep', 'deny', 'desk', 'diet', 'dirt', 'dish', 'disk', 'dock', 'done', 'door',
  'dose', 'down', 'draw', 'drop', 'drug', 'drum', 'dual', 'dull', 'dusk', 'dust',
  'duty', 'each', 'earn', 'ease', 'east', 'edge', 'even', 'ever', 'evil', 'face',
  'fact', 'fail', 'fair', 'fall', 'fame', 'fare', 'farm', 'fast', 'fate', 'fear',
  'feed', 'feel', 'feet', 'fell', 'felt', 'file', 'fill', 'film', 'find', 'fine',
  'fire', 'firm', 'fish', 'fist', 'flag', 'flat', 'flow', 'foam', 'fold', 'folk',
  'fond', 'food', 'fool', 'foot', 'form', 'fort', 'four', 'free', 'from', 'fuel',
  'full', 'fund', 'gain', 'game', 'gave', 'gear', 'gift', 'girl', 'give', 'glad',
  'glow', 'goal', 'gold', 'golf', 'good', 'grab', 'gram', 'gray', 'grip', 'grow',
  'gulf', 'gust', 'hack', 'hail', 'half', 'hall', 'halt', 'hand', 'hang', 'hard',
  'harm', 'hate', 'have', 'head', 'heal', 'heap', 'hear', 'heat', 'heel', 'held',
  'hell', 'help', 'here', 'hero', 'hide', 'high', 'hill', 'hint', 'hire', 'hold',
  'hole', 'holy', 'home', 'hood', 'hook', 'hope', 'horn', 'host', 'hour', 'huge',
  'hunt', 'hurt', 'icon', 'idea', 'idle', 'inch', 'into', 'iron', 'item', 'jail',
  'join', 'joke', 'jump', 'just', 'keen', 'keep', 'kill', 'kind', 'king', 'knew',
  'know', 'lack', 'lake', 'lamp', 'land', 'lane', 'last', 'late', 'lead', 'lean',
  'leap', 'left', 'lend', 'less', 'life', 'lift', 'like', 'lime', 'line', 'link',
  'lion', 'list', 'live', 'load', 'loan', 'lock', 'lone', 'long', 'look', 'lord',
  'lose', 'loss', 'lost', 'loud', 'love', 'luck', 'lung', 'made', 'mail', 'main',
  'make', 'male', 'mall', 'many', 'mark', 'mass', 'mast', 'mate', 'math', 'maze',
  'meal', 'mean', 'meat', 'meet', 'melt', 'memo', 'menu', 'mere', 'mild', 'mile',
  'milk', 'mill', 'mind', 'mine', 'miss', 'mode', 'moon', 'more', 'most', 'move',
  'much', 'must', 'myth', 'nail', 'name', 'navy', 'near', 'neck', 'need', 'news',
  'next', 'nice', 'nine', 'node', 'noon', 'norm', 'nose', 'note', 'noun', 'null',
  'open', 'over', 'page', 'paid', 'pain', 'pair', 'palm', 'park', 'part', 'past',
  'path', 'peak', 'peel', 'peer', 'pick', 'pile', 'pine', 'pink', 'pipe', 'plan',
  'play', 'plea', 'plot', 'plow', 'plug', 'poem', 'poet', 'pole', 'poll', 'pond',
  'pool', 'poor', 'port', 'pose', 'post', 'pour', 'pray', 'prep', 'prey', 'prod',
  'prop', 'pull', 'pump', 'pure', 'push', 'race', 'raid', 'rail', 'rain', 'ramp',
  'rank', 'rate', 'read', 'real', 'reap', 'reel', 'rent', 'rest', 'rice', 'rich',
  'ride', 'ring', 'rise', 'risk', 'road', 'role', 'roll', 'roof', 'room', 'root',
  'rose', 'ruin', 'rule', 'rush', 'safe', 'sage', 'sail', 'sake', 'sale', 'salt',
  'same', 'sand', 'save', 'scan', 'seal', 'seed', 'seek', 'seem', 'self', 'sell',
  'send', 'sent', 'shed', 'ship', 'shoe', 'shop', 'shot', 'show', 'shut', 'side',
  'sign', 'silk', 'sing', 'sink', 'site', 'size', 'skin', 'skip', 'slam', 'slim',
  'slip', 'slow', 'slug', 'snap', 'snow', 'soak', 'soar', 'sock', 'soft', 'soil',
  'sold', 'sole', 'some', 'song', 'soon', 'sort', 'soul', 'span', 'spin', 'spot',
  'star', 'stay', 'stem', 'step', 'stir', 'stop', 'such', 'suit', 'sung', 'sunk',
  'swap', 'swim', 'tale', 'talk', 'tall', 'task', 'team', 'tear', 'tell', 'tend',
  'term', 'test', 'text', 'than', 'that', 'them', 'then', 'they', 'thin', 'this',
  'thus', 'tide', 'till', 'time', 'tiny', 'tire', 'told', 'toll', 'tone', 'tore',
  'torn', 'toss', 'tour', 'town', 'trap', 'tree', 'trim', 'trip', 'true', 'tube',
  'tune', 'turn', 'twin', 'type', 'unit', 'upon', 'used', 'user', 'vary', 'vast',
  'veil', 'vein', 'verb', 'very', 'view', 'vine', 'void', 'vote', 'wade', 'wage',
  'wake', 'walk', 'wall', 'ward', 'warm', 'warn', 'wary', 'wave', 'weak', 'wear',
  'weed', 'well', 'went', 'were', 'west', 'when', 'wide', 'wild', 'will', 'wind',
  'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'wolf', 'wood', 'word', 'wore',
  'work', 'worm', 'worn', 'wrap', 'yard', 'year', 'yell', 'your', 'zero', 'zone',
];
const wordsByLength = new Map([[3, wordList3], [4, wordList4]]);

// Entropy formula used by the worker's computeWaveFromPuzzle / masksToWave
const entropy = (options: string[]) => options.length <= 1 ? 0 : Math.log(options.length);

// ---------------------------------------------------------------------------
// Entropy contracts
// ---------------------------------------------------------------------------

describe('boundary: entropy', () => {
  test('black cell has zero entropy (no options)', () => {
    const r = propagateConstraints({ size, blacks: twoCorners, wordsByLength, placedLetters: new Map() });
    // (0,0) is black in twoCorners
    expect(r.options[0][0]).toHaveLength(0);
    expect(entropy(r.options[0][0])).toBe(0);
  });

  test('decided cell (single placed letter) has zero entropy', () => {
    const r = propagateConstraints({
      size, blacks: twoCorners, wordsByLength,
      placedLetters: new Map([['0,1', 'c']]),
    });
    expect(r.contradiction).toBe(false);
    expect(r.options[0][1]).toEqual(['c']);
    expect(entropy(r.options[0][1])).toBe(0);
  });

  test('undecided cell has entropy = Math.log(n)', () => {
    const r = propagateConstraints({ size, blacks: twoCorners, wordsByLength, placedLetters: new Map() });
    const opts = r.options[1][1]; // interior cell — many options
    expect(opts.length).toBeGreaterThan(1);
    expect(entropy(opts)).toBeCloseTo(Math.log(opts.length));
  });
});

// ---------------------------------------------------------------------------
// withTileUpdates-equivalent: placing and erasing
// ---------------------------------------------------------------------------

describe('boundary: placing and erasing letters', () => {
  test('placing a letter narrows options at crossing cells', () => {
    const base = propagateConstraints({ size, blacks: twoCorners, wordsByLength, placedLetters: new Map() });
    const constrained = propagateConstraints({
      size, blacks: twoCorners, wordsByLength,
      placedLetters: new Map([['1,1', 'a']]),
    });
    expect(constrained.contradiction).toBe(false);
    expect(constrained.options[1][1]).toEqual(['a']);
    // Cells crossing (1,1) should have fewer or equal options
    expect(constrained.options[0][1].length).toBeLessThanOrEqual(base.options[0][1].length);
    expect(constrained.options[1][0].length).toBeLessThanOrEqual(base.options[1][0].length);
    // At least one crossing cell must be strictly narrowed
    const narrowed =
      constrained.options[0][1].length < base.options[0][1].length ||
      constrained.options[1][0].length < base.options[1][0].length;
    expect(narrowed).toBe(true);
  });

  test('removing a constraint (erasing) restores options', () => {
    const withLetter = propagateConstraints({
      size, blacks: twoCorners, wordsByLength,
      placedLetters: new Map([['1,1', 'a']]),
    });
    const without = propagateConstraints({ size, blacks: twoCorners, wordsByLength, placedLetters: new Map() });
    // Every cell should have at least as many options without the constraint
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        expect(without.options[r][c].length).toBeGreaterThanOrEqual(withLetter.options[r][c].length);
  });
});

// ---------------------------------------------------------------------------
// Word viability contracts
// ---------------------------------------------------------------------------

describe('boundary: word viability', () => {
  test('placing a non-dictionary letter pattern in a slot causes contradiction', () => {
    // 'aaaa' is not in wordList4 — no 4-letter slot can match four 'a's
    const r = propagateConstraints({
      size, blacks: twoCorners, wordsByLength,
      placedLetters: new Map([['1,0','a'],['1,1','a'],['1,2','a'],['1,3','a']]),
    });
    expect(r.contradiction).toBe(true);
  });

  test('placing a dictionary word in a slot does not cause contradiction', () => {
    // 'cat' is in wordList3; place it at row 0 across (len 3: (0,1),(0,2),(0,3))
    // With the full word list, crossing 4-letter slots have many valid options
    const r = propagateConstraints({
      size, blacks: twoCorners, wordsByLength,
      placedLetters: new Map([['0,1','c'],['0,2','a'],['0,3','t']]),
    });
    expect(r.contradiction).toBe(false);
  });

  test('letter absent from every word in the slot length causes contradiction', () => {
    // Chain grid: only word of length 3 is 'pax', only word of length 2 is 'ba'.
    // Placing 'z' at (0,1) forces col 1 down (len 3) to need a word starting with 'z' — none exists.
    const chainSize = 3;
    const chainBlacks: boolean[][] = [
      [true,  false, true],
      [false, false, true],
      [true,  false, true],
    ];
    const r = propagateConstraints({
      size: chainSize,
      blacks: chainBlacks,
      wordsByLength: new Map([[2, ['ba']], [3, ['pax']]]),
      placedLetters: new Map([['0,1', 'z']]),
    });
    expect(r.contradiction).toBe(true);
  });
});
