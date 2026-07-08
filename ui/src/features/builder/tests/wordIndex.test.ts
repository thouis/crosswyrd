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

test('buildWordIndex handles more than 32 words of one length', () => {
  // build 33 distinct 5-letter words
  const words: string[] = [];
  for (let i = 0; i < 26 && words.length < 33; i++) {
    for (let j = 0; j < 26 && words.length < 33; j++) {
      words.push('a' + String.fromCharCode(97 + i) + String.fromCharCode(97 + j) + 'aa');
    }
  }
  expect(words.length).toBe(33);
  const idx = buildWordIndex(words, ENGLISH);
  expect(idx.words[5]).toHaveLength(33);
  expect(idx.words[5]).toEqual([...words].sort());
});

// ---------------------------------------------------------------------------
// addWords — new length group
// ---------------------------------------------------------------------------

test('addWords creates new length group', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  addWords(idx, ['fish'], ENGLISH);
  expect(idx.words[4]).toEqual(['fish']);
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

test('addWords past the 32-word boundary keeps all words and dedups', () => {
  const idx = buildWordIndex(['aaaaa'], ENGLISH);
  const newWords: string[] = [];
  for (let i = 0; i < 26 && newWords.length < 40; i++) {
    for (let j = 0; j < 26 && newWords.length < 40; j++) {
      newWords.push('b' + String.fromCharCode(97 + i) + String.fromCharCode(97 + j) + 'bb');
    }
  }
  addWords(idx, [...newWords, ...newWords, 'aaaaa'], ENGLISH);
  expect(idx.words[5]).toHaveLength(41);
  for (const w of newWords) expect(idx.words[5]).toContain(w);
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
