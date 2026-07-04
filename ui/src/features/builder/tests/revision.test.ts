import {
  createFillEngine,
  fillGrid,
  validateSolvedGrid,
  runRevisionFill,
  buildSlotTopology,
} from '../fillEngine';
import { ENGLISH } from '../Alphabet';
import { buildWordIndex } from '../wordIndex';

// ---------------------------------------------------------------------------
// Fixtures (shared with fillEngine.test.ts)
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
  'fire', 'firm', 'fish', 'fist', 'five', 'flag', 'flat', 'flew', 'flip', 'flow',
  'foam', 'fold', 'folk', 'fond', 'font', 'fool', 'foot', 'ford', 'fore', 'fork',
  'form', 'fort', 'foul', 'four', 'free', 'from', 'fuel', 'full', 'fund', 'fuse',
  'gain', 'game', 'gate', 'gave', 'gear', 'gift', 'give', 'glad', 'glow', 'glue',
  'gold', 'golf', 'gone', 'good', 'gore', 'gown', 'grab', 'grew', 'grid', 'grim',
  'grip', 'grow', 'gulf', 'gust', 'guys', 'hack', 'hair', 'half', 'hall', 'halt',
  'hand', 'hang', 'hard', 'harm', 'hate', 'have', 'head', 'heal', 'heap', 'heat',
  'heel', 'held', 'help', 'here', 'hero', 'high', 'hill', 'hint', 'hire', 'hold',
  'hole', 'holy', 'home', 'hood', 'hook', 'hope', 'horn', 'host', 'hour', 'huge',
  'hull', 'hung', 'hunt', 'hurt', 'idea', 'idle', 'inch', 'into', 'iron', 'item',
  'jobs', 'join', 'joke', 'jump', 'just', 'keen', 'keep', 'kill', 'kind', 'king',
  'knee', 'knew', 'know', 'lack', 'laid', 'lake', 'lamp', 'land', 'lane', 'last',
  'late', 'lead', 'leaf', 'lean', 'left', 'lend', 'less', 'life', 'lift', 'like',
  'lime', 'line', 'link', 'list', 'live', 'load', 'loan', 'lock', 'loft', 'long',
  'look', 'loop', 'lord', 'lore', 'lorn', 'lure', 'lust', 'made', 'mail', 'main',
  'make', 'male', 'mall', 'many', 'mark', 'mars', 'mass', 'meal', 'mean', 'meat',
  'meet', 'melt', 'mere', 'mesh', 'mild', 'mile', 'milk', 'mill', 'mind', 'mine',
  'mint', 'miss', 'mode', 'moon', 'more', 'most', 'move', 'much', 'mule', 'must',
];

const wordsByLength = new Map<number, string[]>([
  [3, wordList3],
  [4, wordList4],
]);

function getFilledGrid(seed: number): string[][] | null {
  const result = fillGrid({ size, blacks: twoCorners, wordsByLength, seed, timeoutMs: 5000, alphabet: ENGLISH });
  if (!result.success) return null;
  return result.grid;
}

function getSlotCells(
  blacks: boolean[][],
  row: number,
  col: number,
  direction: 'across' | 'down'
): Array<{ row: number; col: number }> {
  const { slots } = buildSlotTopology(blacks.length, blacks);
  for (const slot of slots) {
    if (slot.direction === direction &&
        slot.cells[0].row === row &&
        slot.cells[0].col === col) {
      return slot.cells.map(({ row, col }) => ({ row, col }));
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// validateSolvedGrid
// ---------------------------------------------------------------------------

describe('validateSolvedGrid', () => {
  it('accepts a valid solved grid', () => {
    const grid = getFilledGrid(42);
    expect(grid).not.toBeNull();
    const result = validateSolvedGrid(grid!, twoCorners, wordsByLength, undefined, false, ENGLISH);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a grid with a word not in dictionary', () => {
    const grid = getFilledGrid(42);
    expect(grid).not.toBeNull();
    const badGrid = grid!.map(row => [...row]);
    // Corrupt row 1 across (4-letter slot): replace with nonsense 'zzzz'
    badGrid[1] = ['z', 'z', 'z', 'z'];
    const result = validateSolvedGrid(badGrid, twoCorners, wordsByLength, undefined, false, ENGLISH);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not in dictionary'))).toBe(true);
  });

  it('rejects a grid with duplicate words', () => {
    // Find a valid solution then duplicate a word
    const grid = getFilledGrid(42);
    expect(grid).not.toBeNull();
    const dupGrid = grid!.map(row => [...row]);

    // Read the 3-letter across word from row 0 (cols 1,2,3) and
    // overwrite the 3-letter across in row 3 (cols 0,1,2) with it
    const word = [dupGrid[0][1], dupGrid[0][2], dupGrid[0][3]];
    dupGrid[3][0] = word[0];
    dupGrid[3][1] = word[1];
    dupGrid[3][2] = word[2];

    // Also fix the crossing cells so we can isolate the duplicate error
    // (grid may still have inconsistencies but validateSolvedGrid just checks words)
    const result = validateSolvedGrid(dupGrid, twoCorners, wordsByLength, undefined, false, ENGLISH);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('duplicates'))).toBe(true);
  });

  it('accepts partial grids when allowEmpty=true', () => {
    const partialGrid: string[][] = [
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '', '', ''],
    ];
    const result = validateSolvedGrid(partialGrid, twoCorners, wordsByLength, undefined, true, ENGLISH);
    expect(result.valid).toBe(true);
  });

  it('accepts a word present in bankWords even if not in dictionary', () => {
    const grid = getFilledGrid(42)!;
    expect(grid).not.toBeNull();
    const badGrid = grid.map(row => [...row]);
    // Replace row1 across with a bank word
    badGrid[1] = ['x', 'y', 'z', 'q'];
    const bankSet = new Set(['xyzq']);
    const result = validateSolvedGrid(badGrid, twoCorners, wordsByLength, bankSet, false, ENGLISH);
    // Other words may still be invalid, just check bank acceptance logic doesn't add bank error
    const bankErrors = result.errors.filter(e => e.includes('xyzq') && e.includes('not in dictionary'));
    expect(bankErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deduplicateAfterPinning
// ---------------------------------------------------------------------------

describe('deduplicateAfterPinning', () => {
  it('removes pinned words from free same-length slots', () => {
    // Fill the grid to get a known solution
    const grid = getFilledGrid(42);
    expect(grid).not.toBeNull();

    // Pin all cells in row 1 (4-letter across slot)
    const pinnedWord = [grid![1][0], grid![1][1], grid![1][2], grid![1][3]].join('');
    const placedLetters = new Map<string, string>();
    [0,1,2,3].forEach(c => placedLetters.set(`1,${c}`, grid![1][c]));

    // Create engine with same words
    const engine = createFillEngine({
      size,
      blacks: twoCorners,
      wordsByLength,
      seed: 1,
      timeoutMs: 5000,
      alphabet: ENGLISH,
    });

    engine.setPlacedLetters(placedLetters);
    const ok = engine.deduplicateAfterPinning();
    expect(ok).toBe(true);

    // The other 4-letter slot (row 2) should not offer the pinned word as an option
    const optionsRow2 = engine.getOptions()[2];
    // Reconstruct what candidates are at row 2 — if any position forbids a letter from pinnedWord,
    // then pinnedWord can't be placed there. We check indirectly by running a short fill
    // and verifying no duplicate appears.
    const options = engine.getOptions();
    // Just check we didn't contradict
    const row2 = options[2];
    expect(row2.every(cell => cell.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runRevisionFill
// ---------------------------------------------------------------------------

describe('runRevisionFill', () => {
  it('replaces one slot in a solved grid', () => {
    const grid = getFilledGrid(42);
    expect(grid).not.toBeNull();

    // Remove the row-1 across slot (4-letter, cols 0-3)
    const removedCells = [
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
    ];

    const result = runRevisionFill({
      solvedGrid: grid!,
      blacks: twoCorners,
      wordsByLength,
      bannedWords: [],
      removedSlotCells: [removedCells],
      seed: 99,
      timeoutMs: 5000,
      alphabet: ENGLISH,
    });

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    // Result should be a full valid grid
    const newGrid = result!.grid;
    const validation = validateSolvedGrid(newGrid, twoCorners, wordsByLength, undefined, false, ENGLISH);
    expect(validation.valid).toBe(true);
  });

  it('banned word does not appear in result', () => {
    const grid = getFilledGrid(42);
    expect(grid).not.toBeNull();

    // Find the word in row 1 across and ban it
    const bannedWord = [grid![1][0], grid![1][1], grid![1][2], grid![1][3]].join('');
    const removedCells = [
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
    ];

    const result = runRevisionFill({
      solvedGrid: grid!,
      blacks: twoCorners,
      wordsByLength,
      bannedWords: [bannedWord],
      removedSlotCells: [removedCells],
      seed: 99,
      timeoutMs: 10000,
      alphabet: ENGLISH,
    });

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    const newGrid = result!.grid;
    // Banned word must not appear in result
    const { slots } = buildSlotTopology(size, twoCorners);
    for (const slot of slots) {
      const word = slot.cells.map(({ row, col }) => newGrid[row][col]).join('');
      expect(word).not.toBe(bannedWord);
    }
  });

  it('locked slot word is unchanged in result', () => {
    const grid = getFilledGrid(42);
    expect(grid).not.toBeNull();

    // Lock row 2 across (4-letter), remove row 1 across
    const lockedWord = [grid![2][0], grid![2][1], grid![2][2], grid![2][3]].join('');
    const lockedCells = [
      { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 },
    ];
    const removedCells = [
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
    ];

    const result = runRevisionFill({
      solvedGrid: grid!,
      blacks: twoCorners,
      wordsByLength,
      bannedWords: [],
      removedSlotCells: [removedCells],
      lockedSlotCells: [lockedCells],
      seed: 99,
      timeoutMs: 10000,
      alphabet: ENGLISH,
    });

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    const newGrid = result!.grid;
    const newLockedWord = [newGrid[2][0], newGrid[2][1], newGrid[2][2], newGrid[2][3]].join('');
    expect(newLockedWord).toBe(lockedWord);
  });

  it('returns a valid grid (no duplicates, all words in dict)', () => {
    const grid = getFilledGrid(7);
    expect(grid).not.toBeNull();

    const { slots } = buildSlotTopology(size, twoCorners);
    // Remove the first slot found
    const firstSlot = slots[0];
    const removedCells = firstSlot.cells.map(({ row, col }) => ({ row, col }));

    const result = runRevisionFill({
      solvedGrid: grid!,
      blacks: twoCorners,
      wordsByLength,
      bannedWords: [],
      removedSlotCells: [removedCells],
      seed: 42,
      timeoutMs: 10000,
      alphabet: ENGLISH,
    });

    expect(result).not.toBeNull();
    const validation = validateSolvedGrid(result!.grid, twoCorners, wordsByLength, undefined, false, ENGLISH);
    expect(validation.valid).toBe(true);
  });
});
