import {
  FillEngineInstance,
  createFillEngine,
  propagateConstraints,
  buildSlotTopology,
} from './fillEngine';
import { ENGLISH } from './Alphabet';

// 4×4 grid with top-left and bottom-right corners black:
//   B W W W
//   W W W W
//   W W W W
//   W W W B
// Slots: 4 across (len 3,4,4,3) and 4 down (len 3,4,4,3)
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
  'dub', 'due', 'ebb', 'egg', 'ego', 'elf', 'elk', 'elm', 'end', 'eve', 'eye',
  'fan', 'far', 'fat', 'fed', 'fee', 'few', 'fig', 'fin', 'fir', 'fit', 'fix',
  'fly', 'foe', 'fog', 'for', 'fox', 'fun', 'fur', 'gag', 'gap', 'gas', 'gem',
  'get', 'god', 'got', 'gum', 'gun', 'gut', 'guy', 'gym', 'had', 'ham', 'hat',
  'her', 'hey', 'him', 'his', 'hit', 'hoe', 'hog', 'hop', 'hot', 'how', 'hub',
  'hug', 'hum', 'hut', 'ice', 'icy', 'ill', 'ink', 'inn', 'ion', 'ire', 'ivy',
  'jab', 'jam', 'jar', 'jaw', 'jet', 'job', 'jog', 'joy', 'jug', 'key', 'kid',
  'kit', 'lab', 'lag', 'lap', 'law', 'lay', 'led', 'leg', 'let', 'lid', 'lie',
  'lip', 'log', 'lot', 'low', 'mad', 'man', 'map', 'mat', 'may', 'men', 'met',
  'mid', 'mix', 'mob', 'mom', 'mop', 'mud', 'mug', 'nab', 'nap', 'net', 'new',
  'nib', 'nip', 'nod', 'nor', 'not', 'now', 'nut', 'oaf', 'oak', 'oar', 'oat',
  'odd', 'ode', 'off', 'oft', 'oil', 'old', 'one', 'orb', 'ore', 'our', 'out',
  'owe', 'owl', 'own', 'pad', 'pal', 'pan', 'pat', 'paw', 'pay', 'pea', 'peg',
  'pen', 'pep', 'per', 'pet', 'pew', 'pie', 'pig', 'pin', 'pit', 'ply', 'pod',
  'pop', 'pot', 'pro', 'pry', 'pub', 'pug', 'pun', 'pup', 'put', 'rag', 'ram',
  'ran', 'rap', 'rat', 'raw', 'ray', 'red', 'rib', 'rid', 'rig', 'rim', 'rip',
  'rob', 'rod', 'roe', 'rot', 'row', 'rub', 'rug', 'run', 'rye', 'sac', 'sad',
  'sag', 'sap', 'sat', 'saw', 'say', 'sea', 'see', 'set', 'sew', 'she', 'shy',
  'sin', 'sip', 'sir', 'sit', 'six', 'ski', 'sky', 'sly', 'sob', 'son', 'sow',
  'soy', 'spa', 'spy', 'sty', 'sub', 'sue', 'sum', 'sun', 'tag', 'tan', 'tap',
  'tax', 'ten', 'the', 'thy', 'tie', 'tin', 'tip', 'toe', 'tog', 'ton', 'top',
  'toy', 'try', 'tub', 'tug', 'two', 'ugh', 'urn', 'use', 'van', 'vat', 'vet',
  'via', 'vie', 'vow', 'wad', 'wag', 'war', 'was', 'wax', 'way', 'web', 'wed',
  'wee', 'wet', 'who', 'why', 'wig', 'win', 'wit', 'woe', 'won', 'woo', 'wow',
  'wry', 'yak', 'yap', 'yaw', 'yea', 'yen', 'yes', 'yet', 'yew', 'you', 'zap',
  'zip', 'zoo',
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

describe('propagateConstraints', () => {
  test('no placed letters — all white cells have options', () => {
    const r = propagateConstraints({
      size,
      blacks: twoCorners,
      wordsByLength,
      placedLetters: new Map(),
    });
    expect(r.contradiction).toBe(false);
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        if (twoCorners[row][col]) continue;
        expect(r.options[row][col].length).toBeGreaterThan(0);
      }
  });

  test('placed letter propagates to crossing cells', () => {
    // (1,1) is at position 1 of the length-4 across slot (row 1)
    // and position 1 of the length-4 down slot (col 1)
    const r = propagateConstraints({
      size,
      blacks: twoCorners,
      wordsByLength,
      placedLetters: new Map([['1,1', 'a']]),
    });
    expect(r.contradiction).toBe(false);
    expect(r.options[1][1]).toEqual(['a']);
    expect(r.options[0][1].length).toBeLessThan(ENGLISH.letters.length);
    expect(r.options[1][0].length).toBeLessThan(ENGLISH.letters.length);
  });

  test('contradictory placement returns contradiction:true', () => {
    const r = propagateConstraints({
      size,
      blacks: twoCorners,
      wordsByLength,
      placedLetters: new Map([['0,1', 'q']]),
    });
    expect(r.contradiction).toBe(true);
  });
});

describe('FillEngineInstance', () => {
  test('step fills the grid in finite steps', () => {
    const engine = createFillEngine({
      size,
      blacks: twoCorners,
      wordsByLength,
      seed: 1,
    });
    let done = false;
    for (let i = 0; i < 1000 && !done; i++) {
      done = engine.step(10);
    }
    const result = engine.getResult();
    expect(result.success).toBe(true);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (twoCorners[r][c]) continue;
        expect(result.grid[r][c]).toMatch(/^[a-z]$/);
      }
  });

  test('setPlacedLetters pins cells and reduces options', () => {
    const engine = createFillEngine({
      size,
      blacks: twoCorners,
      wordsByLength,
    });
    // (0,1) is the first cell of the length-3 across slot and
    // the first cell of the length-4 down slot (col 1)
    const ok = engine.setPlacedLetters(new Map([['0,1', 'c']]));
    expect(ok).toBe(true);
    const opts = engine.getOptions();
    expect(opts[0][1]).toEqual(['c']);
    expect(opts[0][2].length).toBeLessThan(26);
  });

  test('setPlacedLetters with contradiction returns false', () => {
    const engine = createFillEngine({
      size,
      blacks: twoCorners,
      wordsByLength,
    });
    const ok = engine.setPlacedLetters(new Map([['0,1', 'q']]));
    expect(ok).toBe(false);
  });

  test('getProgressUpdate has cellMasksLo and cellMasksHi', () => {
    const engine = createFillEngine({
      size,
      blacks: twoCorners,
      wordsByLength,
    });
    const update = engine.getProgressUpdate();
    expect(update.cellMasksLo).toBeInstanceOf(Int32Array);
    expect(update.cellMasksHi).toBeInstanceOf(Int32Array);
    expect(update.cellMasksLo.length).toBe(size * size);
    expect(update.cellMasksHi.length).toBe(size * size);
  });

  test('maxSteps limit returns maxSteps failureReason', () => {
    const engine = createFillEngine({
      size,
      blacks: twoCorners,
      wordsByLength,
      seed: 1,
      maxSteps: 3,
    });
    let done = false;
    for (let i = 0; i < 1000 && !done; i++) {
      done = engine.step(10);
    }
    const result = engine.getResult();
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('maxSteps');
  });

  test('timeoutMs limit returns timeout failureReason', () => {
    const engine = createFillEngine({
      size,
      blacks: twoCorners,
      wordsByLength,
      seed: 1,
      timeoutMs: 1,
    });
    // Spin until deadline is past
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    let done = false;
    for (let i = 0; i < 1000 && !done; i++) {
      done = engine.step(10);
    }
    const result = engine.getResult();
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('timeout');
  });
});

describe('buildSlotTopology', () => {
  test('4×4 two-corner grid has 4 across and 4 down slots', () => {
    const topo = buildSlotTopology(size, twoCorners);
    expect(topo.slots.length).toBe(8);
    const across = topo.slots.filter(s => s.direction === 'across');
    const down = topo.slots.filter(s => s.direction === 'down');
    expect(across.length).toBe(4);
    expect(down.length).toBe(4);
    // Two slots of length 3 and two of length 4 in each direction
    const acrossLens = across.map(s => s.len).sort();
    expect(acrossLens).toEqual([3, 3, 4, 4]);
    const downLens = down.map(s => s.len).sort();
    expect(downLens).toEqual([3, 3, 4, 4]);
  });
});
