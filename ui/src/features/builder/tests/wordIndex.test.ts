import { ENGLISH } from '../Alphabet';
import { buildWordIndex, addWords } from '../wordIndex';

// ---------------------------------------------------------------------------
// buildWordIndex — grouping and sorting
// ---------------------------------------------------------------------------

test('groups words by length and sorts within group', () => {
  const idx = buildWordIndex(['cat', 'act', 'dog', 'at'], ENGLISH);
  expect(idx.words[3]).toEqual(['act', 'cat', 'dog']);
  expect(idx.words[2]).toEqual(['at']);
});

test('filters words containing non-alphabet characters', () => {
  const idx = buildWordIndex(['cat', 'café', 'dog', 'hi2'], ENGLISH);
  expect(idx.words[3]).toEqual(['cat', 'dog']);
  expect(idx.words[4]).toBeUndefined();
  expect(idx.words[3]).not.toContain('café');
});

test('filters words with uppercase characters', () => {
  const idx = buildWordIndex(['Cat', 'cat', 'DOG'], ENGLISH);
  expect(idx.words[3]).toEqual(['cat']);
});

test('empty word list produces empty index', () => {
  const idx = buildWordIndex([], ENGLISH);
  expect(Object.keys(idx.words)).toHaveLength(0);
});

test('uses ENGLISH by default when alphabet omitted', () => {
  const idx = buildWordIndex(['cat']);
  expect(idx.words[3]).toEqual(['cat']);
});

// ---------------------------------------------------------------------------
// buildWordIndex — stride
// ---------------------------------------------------------------------------

test('stride is 1 for ≤32 words of same length', () => {
  const words = Array.from({ length: 32 }, (_, i) => 'a' + String.fromCharCode(97 + (i % 25)) + 'a');
  // deduplicate
  const unique = [...new Set(words)].slice(0, 10);
  const idx = buildWordIndex(unique, ENGLISH);
  expect(idx.stride[3]).toBe(1);
});

test('stride is 2 for 33 words of same length', () => {
  // build 33 distinct 5-letter words from 'aaaaa' variant permutations
  const words: string[] = [];
  outer: for (let i = 0; i < 26 && words.length < 33; i++) {
    for (let j = 0; j < 26 && words.length < 33; j++) {
      words.push('a' + String.fromCharCode(97 + i) + String.fromCharCode(97 + j) + 'aa');
    }
  }
  expect(words.length).toBe(33);
  const idx = buildWordIndex(words, ENGLISH);
  expect(idx.stride[5]).toBe(2);
});

// ---------------------------------------------------------------------------
// buildWordIndex — bitset correctness
// ---------------------------------------------------------------------------

test('bitset bit set for correct word at correct position', () => {
  // sorted: ['act', 'cat'] → act=index 0, cat=index 1
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);

  const aIdx = ENGLISH.letterIndex('a');
  const cIdx = ENGLISH.letterIndex('c');

  // position 0: 'act' has 'a', 'cat' has 'c'
  expect(idx.bitsets[3][0][aIdx][0] & (1 << 0)).toBeTruthy(); // act at bit 0
  expect(idx.bitsets[3][0][cIdx][0] & (1 << 1)).toBeTruthy(); // cat at bit 1

  // position 1: both have different letters
  const cIdxAct = ENGLISH.letterIndex('c'); // act[1]='c'
  const aIdxCat = ENGLISH.letterIndex('a'); // cat[1]='a'
  expect(idx.bitsets[3][1][cIdxAct][0] & (1 << 0)).toBeTruthy();
  expect(idx.bitsets[3][1][aIdxCat][0] & (1 << 1)).toBeTruthy();
});

test('bitset bit NOT set for wrong letter at position', () => {
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);
  const zIdx = ENGLISH.letterIndex('z');
  // no word starts with 'z'
  expect(idx.bitsets[3][0][zIdx][0]).toBe(0);
});

// ---------------------------------------------------------------------------
// addWords — new length group
// ---------------------------------------------------------------------------

test('addWords creates new length group', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  addWords(idx, ['fish'], ENGLISH);
  expect(idx.words[4]).toEqual(['fish']);
  expect(idx.stride[4]).toBe(1);
});

// ---------------------------------------------------------------------------
// addWords — extend existing group
// ---------------------------------------------------------------------------

test('addWords appends to existing group', () => {
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);
  addWords(idx, ['dog'], ENGLISH);
  expect(idx.words[3]).toContain('dog');
  expect(idx.words[3]).toContain('cat');
  expect(idx.words[3]).toContain('act');
});

test('addWords sets bitset bit for new word', () => {
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);
  addWords(idx, ['dot'], ENGLISH);
  // 'dot' is appended at index 2 (after act=0, cat=1)
  const wordIdx = idx.words[3].indexOf('dot');
  const dIdx = ENGLISH.letterIndex('d');
  const unit = wordIdx >>> 5;
  const bit = 1 << (wordIdx & 31);
  expect(idx.bitsets[3][0][dIdx][unit] & bit).toBeTruthy();
});

// ---------------------------------------------------------------------------
// addWords — skip duplicates
// ---------------------------------------------------------------------------

test('addWords skips duplicate words', () => {
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);
  const before = idx.words[3].length;
  addWords(idx, ['cat'], ENGLISH);
  expect(idx.words[3].length).toBe(before);
});

// ---------------------------------------------------------------------------
// addWords — filters non-alphabet chars
// ---------------------------------------------------------------------------

test('addWords ignores words with non-alphabet characters', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  addWords(idx, ['café'], ENGLISH);
  expect(idx.words[4]).toBeUndefined();
});

// ---------------------------------------------------------------------------
// custom alphabet
// ---------------------------------------------------------------------------

test('buildWordIndex with custom alphabet excludes words with foreign letters', () => {
  const alpha = new (require('../Alphabet').Alphabet)(['a', 'b', 'c', 'd', 'e']);
  const idx = buildWordIndex(['abc', 'abe', 'xyz'], alpha);
  expect(idx.words[3]).toEqual(['abc', 'abe']);
  expect(idx.words[3]).not.toContain('xyz');
});
