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
// addWords — return value (inserted words)
// ---------------------------------------------------------------------------

test('addWords returns exactly the inserted words', () => {
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);
  const inserted = addWords(idx, ['dog', 'fish'], ENGLISH);
  expect(inserted).toEqual(['dog', 'fish']);
});

test('addWords return excludes duplicates already in the index', () => {
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);
  const inserted = addWords(idx, ['cat', 'dog'], ENGLISH);
  expect(inserted).toEqual(['dog']);
});

test('addWords return excludes out-of-alphabet words', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  const inserted = addWords(idx, ['café', 'dog'], ENGLISH);
  expect(inserted).toEqual(['dog']);
});

test('addWords return excludes duplicates within the same call', () => {
  const idx = buildWordIndex([], ENGLISH);
  const inserted = addWords(idx, ['dog', 'dog', 'fish'], ENGLISH);
  expect(inserted).toEqual(['dog', 'fish']);
});

test('addWords returns empty array when nothing is inserted', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  expect(addWords(idx, ['cat', 'café'], ENGLISH)).toEqual([]);
  expect(addWords(idx, [], ENGLISH)).toEqual([]);
});

// ---------------------------------------------------------------------------
// addWords — maintains sorted order (minor 9)
// ---------------------------------------------------------------------------

test('addWords keeps the per-length list sorted after inserting into the middle', () => {
  const idx = buildWordIndex(['act', 'zoo'], ENGLISH);
  addWords(idx, ['dog'], ENGLISH);
  expect(idx.words[3]).toEqual(['act', 'dog', 'zoo']);
});

test('addWords keeps the per-length list sorted across multiple incremental inserts', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  addWords(idx, ['zoo'], ENGLISH);
  addWords(idx, ['act'], ENGLISH);
  addWords(idx, ['bat'], ENGLISH);
  expect(idx.words[3]).toEqual([...idx.words[3]].sort());
  expect(idx.words[3]).toEqual(['act', 'bat', 'cat', 'zoo']);
});

test('addWords duplicate detection still works after incremental inserts disturb order', () => {
  const idx = buildWordIndex(['cat'], ENGLISH);
  addWords(idx, ['zoo'], ENGLISH);
  addWords(idx, ['act'], ENGLISH);
  const before = idx.words[3].length;
  const inserted = addWords(idx, ['act'], ENGLISH);
  expect(inserted).toEqual([]);
  expect(idx.words[3].length).toBe(before);
});

// ---------------------------------------------------------------------------
// bank-word lifecycle (mirrors WFCWorker's insertedBankWords bookkeeping;
// the comlink worker itself can't run under jest, so we replicate its
// add/remove logic against the wordIndex module here)
// ---------------------------------------------------------------------------

// Replicates WFCWorker.removeWordsFromIndex: only splice words the bank
// actually inserted (dictionary duplicates stay untouched).
function removeBankWords(
  idx: ReturnType<typeof buildWordIndex>,
  bankWords: Set<string>,
  insertedBankWords: Set<string>,
  words: string[]
): void {
  for (const w of words) {
    bankWords.delete(w);
    if (!insertedBankWords.has(w)) continue;
    insertedBankWords.delete(w);
    const ws = idx.words[w.length];
    if (!ws) continue;
    const i = ws.indexOf(w);
    if (i !== -1) ws.splice(i, 1);
  }
}

test('bank lifecycle: removing a bank word that duplicates a dictionary word keeps the dictionary word', () => {
  // Dictionary contains W ('cat'); user banks [W, X] then removes both.
  const idx = buildWordIndex(['cat', 'act'], ENGLISH);
  const bankWords = new Set<string>();
  const insertedBankWords = new Set<string>();

  const toAdd = ['cat', 'dog'];
  for (const w of toAdd) bankWords.add(w);
  const inserted = addWords(idx, toAdd, ENGLISH);
  for (const w of inserted) insertedBankWords.add(w);
  expect(inserted).toEqual(['dog']); // 'cat' was already a dictionary word

  removeBankWords(idx, bankWords, insertedBankWords, ['cat', 'dog']);

  expect(idx.words[3]).toContain('cat'); // dictionary word survives
  expect(idx.words[3]).not.toContain('dog'); // true bank word removed
  expect(bankWords.size).toBe(0);
  expect(insertedBankWords.size).toBe(0);
});

test('bank lifecycle: rebuild + re-add retains bank words and refreshes inserted set', () => {
  // Mirrors WFCWorker.resetIndex: rebuild from the base list, then re-add the
  // retained bank words and refresh insertedBankWords from the return value.
  const baseWordList = ['cat', 'act'];
  let idx = buildWordIndex(baseWordList, ENGLISH);
  const bankWords = new Set<string>(['cat', 'dog']);
  const insertedBankWords = new Set<string>(
    addWords(idx, Array.from(bankWords), ENGLISH)
  );
  expect(insertedBankWords).toEqual(new Set(['dog']));

  // Reset: rebuild and re-add (bankWords is NOT cleared).
  idx = buildWordIndex(baseWordList, ENGLISH);
  insertedBankWords.clear();
  for (const w of addWords(idx, Array.from(bankWords), ENGLISH))
    insertedBankWords.add(w);

  expect(idx.words[3]).toEqual(expect.arrayContaining(['cat', 'act', 'dog']));
  expect(insertedBankWords).toEqual(new Set(['dog']));

  // Removal after reset still behaves correctly.
  removeBankWords(idx, bankWords, insertedBankWords, ['cat', 'dog']);
  expect(idx.words[3]).toContain('cat');
  expect(idx.words[3]).not.toContain('dog');
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
