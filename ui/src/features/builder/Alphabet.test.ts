import { Alphabet, ENGLISH } from './Alphabet';

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

test('constructor throws when alphabet exceeds 32 letters', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyzabcdefg'.split('').slice(0, 33);
  expect(() => new Alphabet(letters)).toThrow();
});

test('constructor accepts exactly 32 letters', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyzabcdef'.split('').slice(0, 32);
  expect(() => new Alphabet(letters)).not.toThrow();
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

test('forLetter(a) === 1 (bit 0)', () => {
  expect(ENGLISH.forLetter('a')).toBe(1);
});

test('forLetter(b) === 2 (bit 1)', () => {
  expect(ENGLISH.forLetter('b')).toBe(2);
});

test('forLetter(z) === 1 << 25', () => {
  expect(ENGLISH.forLetter('z')).toBe(1 << 25);
});

test('forLetter produces distinct powers of 2 for all letters', () => {
  const masks = ENGLISH.letters.map((ch) => ENGLISH.forLetter(ch));
  const unique = new Set(masks);
  expect(unique.size).toBe(26);
  for (const m of masks) {
    expect(m & (m - 1)).toBe(0); // power of 2
    expect(m).toBeGreaterThan(0);
  }
});

// ---------------------------------------------------------------------------
// ALL mask
// ---------------------------------------------------------------------------

test('ALL mask has all 26 English bits set', () => {
  let combined = 0;
  for (const ch of ENGLISH.letters) combined |= ENGLISH.forLetter(ch);
  expect(ENGLISH.ALL).toBe(combined);
});

// ---------------------------------------------------------------------------
// getLetters
// ---------------------------------------------------------------------------

test('getLetters(0) returns empty array', () => {
  expect(ENGLISH.getLetters(0)).toEqual([]);
});

test('getLetters of first 3 bits returns [a, b, c]', () => {
  expect(ENGLISH.getLetters(0b111)).toEqual(['a', 'b', 'c']);
});

test('getLetters(ALL) returns all 26 letters in order', () => {
  expect(ENGLISH.getLetters(ENGLISH.ALL)).toEqual([...ENGLISH.letters]);
});

test('getLetters on custom alphabet', () => {
  const alpha = new Alphabet(['x', 'y', 'z']);
  // forLetter('y') = bit 1
  expect(alpha.getLetters(alpha.forLetter('y'))).toEqual(['y']);
});
