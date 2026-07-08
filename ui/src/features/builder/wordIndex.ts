import { Alphabet, ENGLISH } from './Alphabet';

export interface WordIndexType {
  words: { [length: number]: string[] };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildWordIndex(wordList: string[], alphabet: Alphabet = ENGLISH): WordIndexType {
  const alphaSet = new Set(alphabet.letters);
  const words: { [length: number]: string[] } = {};

  for (const w of wordList) {
    let valid = true;
    for (let i = 0; i < w.length; i++) { if (!alphaSet.has(w[i])) { valid = false; break; } }
    if (!valid) continue;
    if (!words[w.length]) words[w.length] = [];
    words[w.length].push(w);
  }
  for (const len of Object.keys(words)) words[+len].sort();

  return { words };
}

// ---------------------------------------------------------------------------
// Convenience: group a word list by length (filtered to alphabet letters)
// ---------------------------------------------------------------------------

export function groupWordsByLength(words: string[], alphabet: Alphabet = ENGLISH): Map<number, string[]> {
  const alphaSet = new Set(alphabet.letters);
  const m = new Map<number, string[]>();
  for (const w of words) {
    if (w.length === 0) continue;
    let ok = true;
    for (let i = 0; i < w.length; i++) {
      if (!alphaSet.has(w[i])) { ok = false; break; }
    }
    if (!ok) continue;
    let arr = m.get(w.length);
    if (!arr) { arr = []; m.set(w.length, arr); }
    arr.push(w);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Incremental update — append new words (e.g. word bank) without full rebuild
// ---------------------------------------------------------------------------

export function addWords(index: WordIndexType, newWords: string[], alphabet: Alphabet = ENGLISH): void {
  const alphaSet = new Set(alphabet.letters);

  for (const word of newWords) {
    let valid = true;
    for (let i = 0; i < word.length; i++) { if (!alphaSet.has(word[i])) { valid = false; break; } }
    if (!valid) continue;
    const len = word.length;

    if (!index.words[len]) {
      index.words[len] = [word];
      continue;
    }

    const ws = index.words[len];
    if (ws.includes(word)) continue; // skip duplicate

    ws.push(word);
  }
}
