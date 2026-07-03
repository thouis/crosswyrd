import { Alphabet, LetterMask, ENGLISH } from '../Alphabet';

// ---------------------------------------------------------------------------
// ENGLISH export
// ---------------------------------------------------------------------------

test('ENGLISH has 26 letters and size 26', () => {
  expect(ENGLISH.letters).toHaveLength(26);
  expect(ENGLISH.size).toBe(26);
  expect(ENGLISH.letters[0]).toBe('a');
  expect(ENGLISH.letters[25]).toBe('z');
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

test('custom alphabet has correct size and letters', () => {
  const alpha = new Alphabet(['x', 'y', 'z']);
  expect(alpha.size).toBe(3);
  expect(alpha.letters).toEqual(['x', 'y', 'z']);
});

test('constructor throws when alphabet exceeds 64 letters', () => {
  const letters = Array.from({ length: 65 }, (_, i) => String.fromCharCode(65 + (i % 26)));
  expect(() => new Alphabet(letters)).toThrow();
});

test('constructor accepts exactly 32 letters', () => {
  const letters = Array.from({ length: 32 }, (_, i) => String.fromCharCode(97 + i));
  expect(() => new Alphabet(letters)).not.toThrow();
});

test('constructor accepts exactly 64 letters', () => {
  const letters = Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x41 + i));
  expect(() => new Alphabet(letters)).not.toThrow();
});

// ---------------------------------------------------------------------------
// EMPTY constant
// ---------------------------------------------------------------------------

test('EMPTY has lo=0 and hi=0', () => {
  expect(ENGLISH.EMPTY).toEqual({ lo: 0, hi: 0 });
});

// ---------------------------------------------------------------------------
// letterIndex / letterAt round-trip
// ---------------------------------------------------------------------------

test('letterIndex maps a→0, z→25', () => {
  expect(ENGLISH.letterIndex('a')).toBe(0);
  expect(ENGLISH.letterIndex('z')).toBe(25);
});

test('letterAt maps 0→a, 25→z', () => {
  expect(ENGLISH.letterAt(0)).toBe('a');
  expect(ENGLISH.letterAt(25)).toBe('z');
});

test('letterAt(letterIndex(ch)) round-trips all English letters', () => {
  for (const ch of ENGLISH.letters) {
    expect(ENGLISH.letterAt(ENGLISH.letterIndex(ch))).toBe(ch);
  }
});

// ---------------------------------------------------------------------------
// hasLetter
// ---------------------------------------------------------------------------

test('hasLetter true for letters in alphabet', () => {
  expect(ENGLISH.hasLetter('a')).toBe(true);
  expect(ENGLISH.hasLetter('z')).toBe(true);
  expect(ENGLISH.hasLetter('m')).toBe(true);
});

test('hasLetter false for letters not in alphabet', () => {
  expect(ENGLISH.hasLetter('A')).toBe(false);
  expect(ENGLISH.hasLetter('1')).toBe(false);
  expect(ENGLISH.hasLetter('é')).toBe(false);
  expect(ENGLISH.hasLetter('')).toBe(false);
});

// ---------------------------------------------------------------------------
// forLetter — single-letter masks
// ---------------------------------------------------------------------------

test('forLetter(a) has lo=1 (bit 0), hi=0', () => {
  expect(ENGLISH.forLetter('a')).toEqual({ lo: 1, hi: 0 });
});

test('forLetter(b) has lo=2 (bit 1), hi=0', () => {
  expect(ENGLISH.forLetter('b')).toEqual({ lo: 2, hi: 0 });
});

test('forLetter(z) has lo=1<<25, hi=0', () => {
  expect(ENGLISH.forLetter('z')).toEqual({ lo: 1 << 25, hi: 0 });
});

test('forLetter produces distinct masks for all letters', () => {
  const masks = ENGLISH.letters.map((ch) => ENGLISH.forLetter(ch));
  const loValues = masks.map((m) => m.lo);
  const unique = new Set(loValues);
  expect(unique.size).toBe(26);
  for (const m of masks) {
    expect(m.hi).toBe(0);
    expect(m.lo & (m.lo - 1)).toBe(0); // power of 2
    expect(m.lo).toBeGreaterThan(0);
  }
});

// ---------------------------------------------------------------------------
// ALL mask
// ---------------------------------------------------------------------------

test('ALL mask has all 26 English bits set in lo', () => {
  let combined = 0;
  for (const ch of ENGLISH.letters) combined |= ENGLISH.forLetter(ch).lo;
  expect(ENGLISH.ALL).toEqual({ lo: combined, hi: 0 });
});

test('32-letter alphabet ALL has lo=-1 (all 32 bits set)', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyzabcdef'.split('').slice(0, 32);
  const alpha = new Alphabet(letters);
  expect(alpha.ALL.lo).toBe(-1);
  expect(alpha.ALL.hi).toBe(0);
});

// ---------------------------------------------------------------------------
// getLetters
// ---------------------------------------------------------------------------

test('getLetters(EMPTY) returns empty array', () => {
  expect(ENGLISH.getLetters(ENGLISH.EMPTY)).toEqual([]);
});

test('getLetters of first 3 bits returns [a, b, c]', () => {
  expect(ENGLISH.getLetters({ lo: 0b111, hi: 0 })).toEqual(['a', 'b', 'c']);
});

test('getLetters(ALL) returns all 26 letters in order', () => {
  expect(ENGLISH.getLetters(ENGLISH.ALL)).toEqual([...ENGLISH.letters]);
});

test('getLetters on custom alphabet', () => {
  const alpha = new Alphabet(['x', 'y', 'z']);
  expect(alpha.getLetters(alpha.forLetter('y'))).toEqual(['y']);
});

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------

test('isEmpty returns true for EMPTY', () => {
  expect(ENGLISH.isEmpty(ENGLISH.EMPTY)).toBe(true);
});

test('isEmpty returns false for non-zero mask', () => {
  expect(ENGLISH.isEmpty(ENGLISH.forLetter('a'))).toBe(false);
  expect(ENGLISH.isEmpty(ENGLISH.ALL)).toBe(false);
});

// ---------------------------------------------------------------------------
// isSingleLetter
// ---------------------------------------------------------------------------

test('isSingleLetter true for single-bit masks', () => {
  expect(ENGLISH.isSingleLetter(ENGLISH.forLetter('a'))).toBe(true);
  expect(ENGLISH.isSingleLetter(ENGLISH.forLetter('z'))).toBe(true);
});

test('isSingleLetter false for EMPTY and multi-bit masks', () => {
  expect(ENGLISH.isSingleLetter(ENGLISH.EMPTY)).toBe(false);
  expect(ENGLISH.isSingleLetter(ENGLISH.ALL)).toBe(false);
  expect(ENGLISH.isSingleLetter({ lo: 0b11, hi: 0 })).toBe(false);
});

// ---------------------------------------------------------------------------
// getSingleLetter
// ---------------------------------------------------------------------------

test('getSingleLetter returns correct letter for each bit', () => {
  for (const ch of ENGLISH.letters) {
    expect(ENGLISH.getSingleLetter(ENGLISH.forLetter(ch))).toBe(ch);
  }
});

// ---------------------------------------------------------------------------
// hasLetterAt
// ---------------------------------------------------------------------------

test('hasLetterAt true when bit i is set', () => {
  const m = ENGLISH.forLetter('a'); // bit 0
  expect(ENGLISH.hasLetterAt(m, 0)).toBe(true);
  expect(ENGLISH.hasLetterAt(m, 1)).toBe(false);
});

test('hasLetterAt for bit 25 (z)', () => {
  const m = ENGLISH.forLetter('z'); // bit 25
  expect(ENGLISH.hasLetterAt(m, 25)).toBe(true);
  expect(ENGLISH.hasLetterAt(m, 0)).toBe(false);
});

test('hasLetterAt on ALL mask: every bit 0–25 is set', () => {
  for (let i = 0; i < 26; i++) {
    expect(ENGLISH.hasLetterAt(ENGLISH.ALL, i)).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// onlyLetterAt
// ---------------------------------------------------------------------------

test('onlyLetterAt(i) matches forLetter(letterAt(i))', () => {
  for (let i = 0; i < 26; i++) {
    expect(ENGLISH.onlyLetterAt(i)).toEqual(ENGLISH.forLetter(ENGLISH.letterAt(i)));
  }
});

// ---------------------------------------------------------------------------
// 64-bit: lo/hi boundary tests
// ---------------------------------------------------------------------------

const ALPHA64 = new Alphabet(Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x41 + i)));
const ALPHA36 = new Alphabet(Array.from({ length: 36 }, (_, i) =>
  i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(48 + i - 26)
));

test('64-letter alphabet: forLetter at index 31 (last lo bit)', () => {
  const m = ALPHA64.forLetter(ALPHA64.letterAt(31));
  expect(m).toEqual({ lo: 1 << 31, hi: 0 });
});

test('64-letter alphabet: forLetter at index 32 (first hi bit)', () => {
  const m = ALPHA64.forLetter(ALPHA64.letterAt(32));
  expect(m).toEqual({ lo: 0, hi: 1 });
});

test('64-letter alphabet: forLetter at index 63 (last hi bit)', () => {
  const m = ALPHA64.forLetter(ALPHA64.letterAt(63));
  expect(m).toEqual({ lo: 0, hi: 1 << 31 });
});

test('64-letter alphabet: ALL has lo=-1 and hi=-1', () => {
  expect(ALPHA64.ALL).toEqual({ lo: -1, hi: -1 });
});

test('36-letter alphabet: ALL has lo=-1 and hi=(1<<4)-1=15', () => {
  expect(ALPHA36.ALL).toEqual({ lo: -1, hi: (1 << 4) - 1 });
});

test('isSingleLetter: hi-only mask', () => {
  const m = ALPHA64.forLetter(ALPHA64.letterAt(32)); // {lo:0, hi:1}
  expect(ALPHA64.isSingleLetter(m)).toBe(true);
});

test('isSingleLetter: mixed lo+hi mask is not single', () => {
  expect(ALPHA64.isSingleLetter({ lo: 1, hi: 1 })).toBe(false);
});

test('getSingleLetter at indices 0, 31, 32, 63', () => {
  for (const i of [0, 31, 32, 63]) {
    const ch = ALPHA64.letterAt(i);
    expect(ALPHA64.getSingleLetter(ALPHA64.forLetter(ch))).toBe(ch);
  }
});

test('getLetters: sparse hi mask returns correct letters in order', () => {
  // bits 32 and 34 set → letters at index 32 and 34
  const m: LetterMask = { lo: 0, hi: (1 << 0) | (1 << 2) }; // hi bits 0 and 2 = indices 32, 34
  expect(ALPHA64.getLetters(m)).toEqual([ALPHA64.letterAt(32), ALPHA64.letterAt(34)]);
});

test('getLetters: mixed lo+hi mask returns letters in alphabet order', () => {
  const m: LetterMask = { lo: 1, hi: 1 }; // indices 0 and 32
  expect(ALPHA64.getLetters(m)).toEqual([ALPHA64.letterAt(0), ALPHA64.letterAt(32)]);
});

test('hasLetterAt: hi indices', () => {
  const m = ALPHA64.forLetter(ALPHA64.letterAt(33)); // {lo:0, hi:1<<1}
  expect(ALPHA64.hasLetterAt(m, 33)).toBe(true);
  expect(ALPHA64.hasLetterAt(m, 32)).toBe(false);
  expect(ALPHA64.hasLetterAt(m, 0)).toBe(false);
});

test('onlyLetterAt: hi indices match forLetter', () => {
  for (const i of [32, 48, 63]) {
    expect(ALPHA64.onlyLetterAt(i)).toEqual(ALPHA64.forLetter(ALPHA64.letterAt(i)));
  }
});

// ---------------------------------------------------------------------------
// 36-letter fill regression
// ---------------------------------------------------------------------------

test('fill engine with 36-letter alphabet: 4×4 grid fills correctly', () => {
  const { FillEngineInstance } = require('../fillEngine');
  // 4×4 all-white grid, single across/down slots of length 4
  const size = 4;
  const blacks = Array.from({ length: size }, () => Array(size).fill(false));
  // words: 4-letter strings using only letters 0-35 of ALPHA36
  const w4 = [
    ALPHA36.letterAt(0).repeat(0) + [0,1,2,3].map(i => ALPHA36.letterAt(i)).join(''),
    [4,5,6,7].map(i => ALPHA36.letterAt(i)).join(''),
    [8,9,10,11].map(i => ALPHA36.letterAt(i)).join(''),
    [12,13,14,15].map(i => ALPHA36.letterAt(i)).join(''),
    [0,4,8,12].map(i => ALPHA36.letterAt(i)).join(''),
    [1,5,9,13].map(i => ALPHA36.letterAt(i)).join(''),
    [2,6,10,14].map(i => ALPHA36.letterAt(i)).join(''),
    [3,7,11,15].map(i => ALPHA36.letterAt(i)).join(''),
  ];
  const wordsByLength = new Map([[4, w4]]);
  const engine = new FillEngineInstance({ size, blacks, wordsByLength, alphabet: ALPHA36, seed: 1, timeoutMs: 5000 });
  while (!engine.step(1000)) {}
  const result = engine.getResult();
  expect(result.success).toBe(true);
});

test('64-letter alphabet: word index builds without crash', () => {
  const { buildWordIndex } = require('../wordIndex');
  const words = [
    [0,1,2,3].map(i => ALPHA64.letterAt(i)).join(''),
    [32,33,34,35].map(i => ALPHA64.letterAt(i)).join(''),
  ];
  expect(() => buildWordIndex(words, ALPHA64)).not.toThrow();
});
