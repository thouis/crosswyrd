import { Alphabet, ENGLISH } from './Alphabet';

export interface WordIndexType {
  words:   { [length: number]: string[] };
  bitsets: { [length: number]: Uint32Array[][] }; // [pos][letterIdx] → word-index bits
  stride:  { [length: number]: number };           // ceil(nWords / 32)
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildWordIndex(wordList: string[], alphabet: Alphabet = ENGLISH): WordIndexType {
  const alphaSet = new Set(alphabet.letters);
  const alphaSize = alphabet.size;
  const words: { [length: number]: string[] } = {};

  for (const w of wordList) {
    let valid = true;
    for (let i = 0; i < w.length; i++) { if (!alphaSet.has(w[i])) { valid = false; break; } }
    if (!valid) continue;
    if (!words[w.length]) words[w.length] = [];
    words[w.length].push(w);
  }
  for (const len of Object.keys(words)) words[+len].sort();

  const bitsets: { [length: number]: Uint32Array[][] } = {};
  const stride:  { [length: number]: number } = {};

  for (const lenStr of Object.keys(words)) {
    const len = +lenStr;
    const ws = words[len];
    const s = Math.ceil(ws.length / 32);
    stride[len] = s;
    const pb: Uint32Array[][] = Array.from({ length: len }, () =>
      Array.from({ length: alphaSize }, () => new Uint32Array(s))
    );
    for (let i = 0; i < ws.length; i++) {
      const u = i >>> 5, b = 1 << (i & 31);
      for (let p = 0; p < len; p++) pb[p][alphabet.letterIndex(ws[i][p])][u] |= b;
    }
    bitsets[len] = pb;
  }

  return { words, bitsets, stride };
}

// ---------------------------------------------------------------------------
// Incremental update — append new words (e.g. word bank) without full rebuild
// ---------------------------------------------------------------------------

export function addWords(index: WordIndexType, newWords: string[], alphabet: Alphabet = ENGLISH): void {
  const alphaSet = new Set(alphabet.letters);
  const alphaSize = alphabet.size;

  for (const word of newWords) {
    let valid = true;
    for (let i = 0; i < word.length; i++) { if (!alphaSet.has(word[i])) { valid = false; break; } }
    if (!valid) continue;
    const len = word.length;

    if (!index.words[len]) {
      index.words[len] = [word];
      index.stride[len] = 1;
      const pb: Uint32Array[][] = Array.from({ length: len }, () =>
        Array.from({ length: alphaSize }, () => new Uint32Array(1))
      );
      for (let p = 0; p < len; p++) pb[p][alphabet.letterIndex(word[p])][0] |= 1;
      index.bitsets[len] = pb;
      continue;
    }

    const ws = index.words[len];
    if (ws.includes(word)) continue; // skip duplicate

    const i = ws.length;
    const newStride = Math.ceil((i + 1) / 32);
    const pb = index.bitsets[len];

    if (newStride > index.stride[len]) {
      // Crossing a 32-word boundary: extend every bitset array by one Uint32
      for (let p = 0; p < len; p++) {
        for (let c = 0; c < alphaSize; c++) {
          const ext = new Uint32Array(newStride);
          ext.set(pb[p][c]);
          pb[p][c] = ext;
        }
      }
      index.stride[len] = newStride;
    }

    const u = i >>> 5, b = 1 << (i & 31);
    for (let p = 0; p < len; p++) pb[p][alphabet.letterIndex(word[p])][u] |= b;
    ws.push(word);
  }
}
