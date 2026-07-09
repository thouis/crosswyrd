import { ENGLISH } from '../Alphabet';
import { buildWordIndex, addWords } from '../wordIndex';
import {
  createWordSourcePool,
  recordAdd,
  recordRemove,
  wordsToRetainOnRebuild,
  refreshInsertedAfterRebuild,
} from '../wordSourcePool';

// Small helper mirroring how WFCWorker drives the pool against a real index.
function addToIndex(idx, pool, words: string[], source: 'bank' | 'grid') {
  const inserted = addWords(idx, words, ENGLISH);
  recordAdd(pool, words, source, inserted);
}

function removeFromIndex(idx, pool, words: string[]) {
  const toSplice = recordRemove(pool, words);
  for (const w of toSplice) {
    const ws = idx.words[w.length];
    if (!ws) continue;
    const i = ws.indexOf(w);
    if (i !== -1) ws.splice(i, 1);
  }
}

test('add(bank) -> remove(bank) -> spliced', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  const pool = createWordSourcePool();
  addToIndex(idx, pool, ['dog'], 'bank');
  expect(idx.words[3]).toContain('dog');
  removeFromIndex(idx, pool, ['dog']);
  expect(idx.words[3]).not.toContain('dog');
});

test('add(grid) -> add(bank) -> remove(bank) -> NOT spliced (grid source remains)', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  const pool = createWordSourcePool();
  addToIndex(idx, pool, ['dog'], 'grid');
  addToIndex(idx, pool, ['dog'], 'bank'); // already in index, not re-inserted
  expect(idx.words[3]).toContain('dog');
  removeFromIndex(idx, pool, ['dog']);
  // still on the grid, must survive bank removal
  expect(idx.words[3]).toContain('dog');
});

test('add of a base-dictionary duplicate -> remove(bank) -> base word NOT spliced', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  const pool = createWordSourcePool();
  addToIndex(idx, pool, ['cat'], 'bank'); // duplicate of base word, not inserted
  expect(idx.words[3]).toEqual(['cat']);
  removeFromIndex(idx, pool, ['cat']);
  expect(idx.words[3]).toContain('cat');
});

test('reset: bank-sourced words survive, grid-only words dropped', () => {
  const baseWordList = ['cat'];
  let idx = buildWordIndex(baseWordList, ENGLISH);
  const pool = createWordSourcePool();
  addToIndex(idx, pool, ['dog'], 'bank');
  addToIndex(idx, pool, ['fish'], 'grid');

  // Simulate resetIndex: rebuild from base, then re-add retained words.
  idx = buildWordIndex(baseWordList, ENGLISH);
  const retained = wordsToRetainOnRebuild(pool);
  expect(retained).toEqual(['dog']);
  const inserted = addWords(idx, retained, ENGLISH);
  refreshInsertedAfterRebuild(pool, inserted);

  expect(idx.words[3]).toContain('dog');
  expect(idx.words[4]).toBeUndefined(); // 'fish' dropped, never re-added

  // Removal after reset still splices correctly.
  removeFromIndex(idx, pool, ['dog']);
  expect(idx.words[3]).not.toContain('dog');
});

test('grid word remains findable in index after bank removal (regression for major issue 1)', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  const pool = createWordSourcePool();
  // User types unknown word X into the grid.
  addToIndex(idx, pool, ['xylo'], 'grid');
  // User adds X to the word bank (duplicate insert is a no-op on the index).
  addToIndex(idx, pool, ['xylo'], 'bank');
  // User removes X from the bank.
  removeFromIndex(idx, pool, ['xylo']);
  // X must still be indexed because it's still on the grid.
  expect(idx.words[4]).toContain('xylo');
});
