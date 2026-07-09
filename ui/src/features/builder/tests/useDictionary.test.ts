import {
  DictionaryType,
  inDictionary,
  mergeWordsIntoDictionary,
} from '../useDictionary';

test('adding a word of a new length creates its bucket and is findable', () => {
  const base: DictionaryType = { 3: ['act', 'cat'] };
  const merged = mergeWordsIntoDictionary(base, ['fish']);
  expect(merged[4]).toEqual(['fish']);
  expect(inDictionary(merged, 'fish')).toBe(true);
  // existing bucket untouched
  expect(merged[3]).toEqual(['act', 'cat']);
});

test('adding a word of an existing length keeps the bucket sorted', () => {
  const base: DictionaryType = { 3: ['act', 'dog'] };
  const merged = mergeWordsIntoDictionary(base, ['cat']);
  expect(merged[3]).toEqual(['act', 'cat', 'dog']);
  expect(inDictionary(merged, 'cat')).toBe(true);
});

test('mixed lengths merge into the correct buckets', () => {
  const base: DictionaryType = { 3: ['cat'] };
  const merged = mergeWordsIntoDictionary(base, ['act', 'fish', 'at']);
  expect(merged[3]).toEqual(['act', 'cat']);
  expect(merged[4]).toEqual(['fish']);
  expect(merged[2]).toEqual(['at']);
});

test('does not mutate the input dictionary', () => {
  const base: DictionaryType = { 3: ['cat'] };
  mergeWordsIntoDictionary(base, ['act', 'fish']);
  expect(base[3]).toEqual(['cat']);
  expect(base[4]).toBeUndefined();
});

test('adding a word already present does not create a duplicate entry', () => {
  const base: DictionaryType = { 3: ['act', 'cat'] };
  const merged = mergeWordsIntoDictionary(base, ['cat']);
  expect(merged[3]).toEqual(['act', 'cat']);
});

test('adding several words including duplicates within the same call dedupes', () => {
  const base: DictionaryType = { 3: ['cat'] };
  const merged = mergeWordsIntoDictionary(base, ['cat', 'act', 'act']);
  expect(merged[3]).toEqual(['act', 'cat']);
});
