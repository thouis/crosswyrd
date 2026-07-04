/**
 * Fill engine — typed-array based crossword filling with queue-based AC propagation.
 * Uses LetterMask = {lo, hi} for up to 64-letter alphabets.
 * PR8: integer word encoding, typed-array frame cloning, O(1) slot selection.
 */

import { Alphabet, LetterMask, ENGLISH } from './Alphabet';

// ---------------------------------------------------------------------------
// Raw bit operations — module-private, no Alphabet dependency.
// Hot-path counterparts to Alphabet's LetterMask-based API.
// ---------------------------------------------------------------------------

function isEmptyRaw(lo: number, hi: number): boolean { return lo === 0 && hi === 0; }
function isSingleLetterRaw(lo: number, hi: number): boolean {
  if (lo !== 0 && hi !== 0) return false;
  if (lo !== 0) return (lo & (lo - 1)) === 0;
  return hi !== 0 && (hi & (hi - 1)) === 0;
}
function hasLetterAtRaw(lo: number, hi: number, i: number): boolean {
  return i < 32 ? (lo & (1 << i)) !== 0 : (hi & (1 << (i - 32))) !== 0;
}
function removeLo(lo: number, i: number): number { return i < 32 ? lo & ~(1 << i) : lo; }
function removeHi(hi: number, i: number): number { return i >= 32 ? hi & ~(1 << (i - 32)) : hi; }
function onlyLo(lo: number, i: number): number { return i < 32 ? lo & (1 << i) : 0; }
function onlyHi(hi: number, i: number): number { return i >= 32 ? hi & (1 << (i - 32)) : 0; }

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface FillSlot {
  cells: Array<{ row: number; col: number }>;
  direction: 'across' | 'down';
}

export interface FillConfig {
  size: number;
  blacks: boolean[][];
  wordsByLength: Map<number, string[]>;
  bankWords?: string[];
  seed?: number;
  timeoutMs?: number;
  maxSteps?: number;
  alphabet?: Alphabet;
}

export type FillFailureReason = 'timeout' | 'maxSteps' | 'noValidFill';

export interface FillResult {
  success: boolean;
  timedOut: boolean;
  failureReason: FillFailureReason | null;
  grid: string[][];
  slots: FillSlot[];
  steps: number;
  backtracks: number;
  timeMs: number;
  filledCells: number;
  totalCells: number;
}

export interface FillProgressUpdate {
  cellMasksLo: Int32Array;
  cellMasksHi: Int32Array;
  steps: number;
  backtracks: number;
  done: boolean;
  success: boolean;
  filledCells: number;
  totalCells: number;
}

export interface PropagateConfig {
  size: number;
  blacks: boolean[][];
  wordsByLength: Map<number, string[]>;
  placedLetters: Map<string, string>;
  alphabet?: Alphabet;
}

export interface PropagateResult {
  options: string[][][];
  contradiction: boolean;
}

export interface SlotTopology {
  slots: Array<{
    id: number;
    cells: Array<{ row: number; col: number }>;
    direction: 'across' | 'down';
    len: number;
    crossings: Array<{ slotId: number; posInCross: number } | null>;
  }>;
  cellToSlots: Array<Array<Array<{ slotId: number; posInSlot: number }>>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededSample<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Slot topology
// ---------------------------------------------------------------------------

export function buildSlotTopology(size: number, blacks: boolean[][]): SlotTopology {
  const slots: SlotTopology['slots'] = [];
  const cellToSlots: SlotTopology['cellToSlots'] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [])
  );

  for (const [dr, dc, dir] of [[0, 1, 'across'], [1, 0, 'down']] as [number, number, 'across' | 'down'][]) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (blacks[r][c]) continue;
        const prevR = r - dr, prevC = c - dc;
        if (prevR >= 0 && prevC >= 0 && !blacks[prevR][prevC]) continue;
        const cells: Array<{ row: number; col: number }> = [];
        let rr = r, cc = c;
        while (rr < size && cc < size && !blacks[rr][cc]) {
          cells.push({ row: rr, col: cc });
          rr += dr; cc += dc;
        }
        if (cells.length < 2) continue;
        const slotId = slots.length;
        slots.push({ id: slotId, cells, direction: dir, len: cells.length, crossings: [] });
        for (let p = 0; p < cells.length; p++) {
          const { row, col } = cells[p];
          cellToSlots[row][col].push({ slotId, posInSlot: p });
        }
      }
    }
  }

  for (const slot of slots) {
    slot.crossings = slot.cells.map(({ row, col }) => {
      const entries = cellToSlots[row][col];
      const cross = entries.find(e => e.slotId !== slot.id);
      if (!cross) return null;
      return { slotId: cross.slotId, posInCross: cross.posInSlot };
    });
  }

  return { slots, cellToSlots };
}

// ---------------------------------------------------------------------------
// Internal slot representation
// ---------------------------------------------------------------------------

interface Slot {
  id: number;
  cells: Array<{ row: number; col: number }>;
  direction: 'across' | 'down';
  len: number;
  crossings: Array<{ slotId: number; posInCross: number } | null>;
}

interface Frame {
  cellMasksLo: Int32Array;
  cellMasksHi: Int32Array;
  slotValidLen: Int32Array;
  wordSupport: Int32Array;
  slotUndecidedCount: Int32Array;
  slotId: number;
  wordTried: number;
  wordSwaps: Array<[number, number, number]>;   // [slotId, posA, posB]
  attemptedAdded: Array<[number, number]>;       // [slotId, wordIdx] added during this frame
  undecidedCells: number;
}

// ---------------------------------------------------------------------------
// FillEngineInstance
// ---------------------------------------------------------------------------

export class FillEngineInstance {
  private size: number;
  private blacks: boolean[][];
  private alphabet: Alphabet;
  private wordsByLength: Map<number, string[]>;

  // Word encoding — assign a global integer index to each word
  private encodedWords: Uint8Array;   // flat [wordIdx * encodedMaxLen + pos] = letterIdx
  private encodedMaxLen: number;
  private wordStrings: string[];      // wordIdx → string
  private stringToWordIdx: Map<string, number>;
  private bankSet: Set<number>;       // word indices that are bank words

  private rng: () => number;
  private deadline: number;
  private maxSteps: number;

  private slots: Slot[];
  private cellToSlots: Array<Array<Array<{ slotId: number; posInSlot: number }>>>;
  private numSlots: number;
  private maxLen: number;

  // slotWords[si][0..slotValidLen[si]-1] = valid candidate indices; beyond validLen are tombstoned
  private slotWords: Int32Array[];
  private slotValidLen: Int32Array;

  // Flat cell mask arrays — bits 0-31 = alphabet indices 0-31/32-63
  private cellMasksLo: Int32Array;
  private cellMasksHi: Int32Array;

  // wordSupport[supportIdx(si, p, li)] = count of valid candidates in slot si with letter li at pos p
  private wordSupport: Int32Array;

  // Undecided cell tracking for O(1) completion check and slot selection
  private undecidedCells = 0;
  private slotUndecidedCount!: Int32Array;
  private slotsByLength: Map<number, number[]> = new Map();

  // Propagation queue: [cellIdx, removedLo, removedHi]
  private propagateQueue: Array<[number, number, number]> = [];
  private propagateQueueHead = 0;

  private stack: Frame[] = [];
  // attempted[si] = word indices already tried for slot si in current ancestor context
  private attempted: Map<number, Set<number>> = new Map();
  // Swap log for the active frame (null when not in a frame)
  private activeSwaps: Array<[number, number, number]> | null = null;

  private steps = 0;
  private backtracks = 0;
  private timedOut = false;
  private finished = false;
  private succeeded = false;
  private startTime = Date.now();

  constructor(config: FillConfig) {
    const {
      size, blacks, wordsByLength,
      bankWords = [], seed = 42,
      timeoutMs = 10000, maxSteps = 400000,
    } = config;
    this.alphabet = config.alphabet ?? ENGLISH;
    this.size = size;
    this.blacks = blacks;
    this.wordsByLength = wordsByLength;
    this.rng = makePRNG(seed);
    this.deadline = timeoutMs === Infinity ? Date.now() + 1e15 : Date.now() + timeoutMs;
    this.maxSteps = maxSteps === 0 ? Infinity : maxSteps;

    ({ slots: this.slots, cellToSlots: this.cellToSlots } = buildSlotTopology(size, blacks) as { slots: Slot[]; cellToSlots: SlotTopology['cellToSlots'] });
    this.numSlots = this.slots.length;
    this.maxLen = this.slots.reduce((m, s) => Math.max(m, s.len), 0);

    // Build word encoding table — assign a global integer index to every word
    this.encodedMaxLen = this.maxLen;
    this.wordStrings = [];
    this.stringToWordIdx = new Map();
    const slotLengths = new Set(this.slots.map(s => s.len));
    const seenWords = new Set<string>();
    const alpha = this.alphabet;

    wordsByLength.forEach((ws, len) => {
      if (!slotLengths.has(len)) return;
      for (const w of ws) {
        if (seenWords.has(w)) continue;
        // Filter words with letters outside the alphabet
        let valid = true;
        for (let i = 0; i < w.length; i++) {
          if (!alpha.hasLetter(w[i])) { valid = false; break; }
        }
        if (!valid) continue;
        seenWords.add(w);
        this.stringToWordIdx.set(w, this.wordStrings.length);
        this.wordStrings.push(w);
      }
    });
    for (const w of bankWords) {
      if (seenWords.has(w)) continue;
      let valid = true;
      for (let i = 0; i < w.length; i++) {
        if (!alpha.hasLetter(w[i])) { valid = false; break; }
      }
      if (!valid) continue;
      seenWords.add(w);
      this.stringToWordIdx.set(w, this.wordStrings.length);
      this.wordStrings.push(w);
    }

    this.encodedWords = new Uint8Array(this.wordStrings.length * this.encodedMaxLen);
    for (let idx = 0; idx < this.wordStrings.length; idx++) {
      const w = this.wordStrings[idx];
      for (let p = 0; p < w.length && p < this.encodedMaxLen; p++) {
        this.encodedWords[idx * this.encodedMaxLen + p] = alpha.letterIndex(w[p]);
      }
    }

    this.bankSet = new Set<number>();
    for (const w of bankWords) {
      const idx = this.stringToWordIdx.get(w);
      if (idx !== undefined) this.bankSet.add(idx);
    }

    // slotWords: bank words first, then dict words (per-slot)
    this.slotWords = this.slots.map(s => {
      const dictWords = wordsByLength.get(s.len) ?? [];
      const bankMatch = bankWords.filter(w => w.length === s.len);
      const seen = new Set<number>();
      const out: number[] = [];
      for (const w of bankMatch) {
        const idx = this.stringToWordIdx.get(w);
        if (idx !== undefined && !seen.has(idx)) { seen.add(idx); out.push(idx); }
      }
      for (const w of dictWords) {
        const idx = this.stringToWordIdx.get(w);
        if (idx !== undefined && !seen.has(idx)) { seen.add(idx); out.push(idx); }
      }
      return new Int32Array(out);
    });

    this.slotValidLen = new Int32Array(this.numSlots);
    for (let i = 0; i < this.numSlots; i++) this.slotValidLen[i] = this.slotWords[i].length;

    // Cell masks: all-letters initially, zero for black cells
    this.cellMasksLo = new Int32Array(size * size).fill(alpha.ALL.lo);
    this.cellMasksHi = new Int32Array(size * size).fill(alpha.ALL.hi);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (blacks[r][c]) {
          this.cellMasksLo[r * size + c] = 0;
          this.cellMasksHi[r * size + c] = 0;
        }
      }
    }

    // Word support counts
    this.wordSupport = new Int32Array(this.numSlots * this.maxLen * alpha.size);
    for (let si = 0; si < this.numSlots; si++) {
      const ws = this.slotWords[si];
      const len = this.slots[si].len;
      for (let wi = 0; wi < ws.length; wi++) {
        const wordIdx = ws[wi];
        for (let p = 0; p < len; p++) {
          this.wordSupport[this.supportIdx(si, p, this.encodedWords[wordIdx * this.encodedMaxLen + p])]++;
        }
      }
    }

    // Undecided cell tracking
    this.slotUndecidedCount = new Int32Array(this.numSlots);
    for (let si = 0; si < this.numSlots; si++) {
      this.slotUndecidedCount[si] = this.slots[si].len;
      this.undecidedCells += this.slots[si].len;
    }
    // Subtract cells shared by two slots (counted once per slot, deduplicate)
    // Actually: count unique cells in slots
    {
      const counted = new Set<number>();
      for (let si = 0; si < this.numSlots; si++) {
        for (const { row, col } of this.slots[si].cells) {
          counted.add(row * size + col);
        }
      }
      this.undecidedCells = counted.size;
    }

    // Precompute slot groups by length
    for (let si = 0; si < this.numSlots; si++) {
      const len = this.slots[si].len;
      let group = this.slotsByLength.get(len);
      if (!group) { group = []; this.slotsByLength.set(len, group); }
      group.push(si);
    }
  }

  private supportIdx(slotId: number, pos: number, letter: number): number {
    return slotId * this.maxLen * this.alphabet.size + pos * this.alphabet.size + letter;
  }

  private updateCellMask(ccIdx: number, newLo: number, newHi: number): void {
    const oldLo = this.cellMasksLo[ccIdx], oldHi = this.cellMasksHi[ccIdx];
    const wasUndecided = !isSingleLetterRaw(oldLo, oldHi) && !isEmptyRaw(oldLo, oldHi);
    const nowUndecided = !isSingleLetterRaw(newLo, newHi) && !isEmptyRaw(newLo, newHi);
    if (wasUndecided !== nowUndecided) {
      const delta = wasUndecided ? -1 : 1;
      if (wasUndecided) this.undecidedCells--;
      else this.undecidedCells++;
      const row = Math.floor(ccIdx / this.size), col = ccIdx % this.size;
      for (const { slotId } of this.cellToSlots[row][col]) {
        this.slotUndecidedCount[slotId] += delta;
      }
    }
    this.cellMasksLo[ccIdx] = newLo;
    this.cellMasksHi[ccIdx] = newHi;
  }

  // Decrement support for a word being removed from slot. When support for a
  // letter at a position drops to zero, remove it from the crossing cell mask.
  private decrementSupportForWord(wordIdx: number, slotId: number, slot: Slot): boolean {
    const size = this.size;
    for (let p = 0; p < slot.len; p++) {
      const li = this.encodedWords[wordIdx * this.encodedMaxLen + p];
      const idx = this.supportIdx(slotId, p, li);
      this.wordSupport[idx]--;
      if (this.wordSupport[idx] === 0) {
        const { row, col } = slot.cells[p];
        const ccIdx = row * size + col;
        const clo = this.cellMasksLo[ccIdx], chi = this.cellMasksHi[ccIdx];
        if (!hasLetterAtRaw(clo, chi, li)) continue;
        const newLo = removeLo(clo, li);
        const newHi = removeHi(chi, li);
        this.updateCellMask(ccIdx, newLo, newHi);
        if (newLo === 0 && newHi === 0) {
          this.propagateQueue.length = 0;
          this.propagateQueueHead = 0;
          return false;
        }
        this.propagateQueue.push([ccIdx, clo & ~newLo, chi & ~newHi]);
      }
    }
    return true;
  }

  private propagate(): boolean {
    const size = this.size;
    while (this.propagateQueueHead < this.propagateQueue.length) {
      const [cellIdx, removedLo, removedHi] = this.propagateQueue[this.propagateQueueHead++];
      const row = Math.floor(cellIdx / size);
      const col = cellIdx % size;

      for (const { slotId, posInSlot } of this.cellToSlots[row][col]) {
        const slot = this.slots[slotId];
        const ws = this.slotWords[slotId];

        // Extract each set bit individually to get the removed letter index
        for (let half = 0; half < 2; half++) {
          let bits = (half === 0 ? removedLo : removedHi) | 0;
          const base = half * 32;
          while (bits !== 0) {
            const lsb = bits & -bits;
            const removedLetter = base + (31 - Math.clz32(lsb));
            bits ^= lsb;

            let newValidLen = this.slotValidLen[slotId];
            for (let wi = 0; wi < newValidLen; ) {
              const w = ws[wi];
              if (this.encodedWords[w * this.encodedMaxLen + posInSlot] === removedLetter) {
                newValidLen--;
                this.activeSwaps?.push([slotId, wi, newValidLen]);
                ws[wi] = ws[newValidLen];
                ws[newValidLen] = w;
                if (!this.decrementSupportForWord(w, slotId, slot)) {
                  this.slotValidLen[slotId] = newValidLen;
                  return false;
                }
              } else {
                wi++;
              }
            }
            this.slotValidLen[slotId] = newValidLen;

            if (newValidLen === 1 && !this.propagateForcedSlot(slotId)) {
              this.propagateQueue.length = 0;
              this.propagateQueueHead = 0;
              return false;
            }
            if (newValidLen === 0 && (this.wordsByLength.get(slot.len)?.length ?? 0) > 0) {
              this.propagateQueue.length = 0;
              this.propagateQueueHead = 0;
              return false;
            }
          }
        }
      }
    }
    this.propagateQueue.length = 0;
    this.propagateQueueHead = 0;
    return true;
  }

  private propagateForcedSlot(slotId: number): boolean {
    const forcedWordIdx = this.slotWords[slotId][0];
    const sameLen = this.slotsByLength.get(this.slots[slotId].len) ?? [];
    for (const si of sameLen) {
      if (si === slotId) continue;
      if (!this.removeWordFromSlotByIdx(forcedWordIdx, si)) return false;
    }
    return true;
  }

  private removeWordFromSlotByIdx(wordIdx: number, slotId: number): boolean {
    const slot = this.slots[slotId];
    const ws = this.slotWords[slotId];
    const validLen = this.slotValidLen[slotId];

    let found = -1;
    for (let wi = 0; wi < validLen; wi++) {
      if (ws[wi] === wordIdx) { found = wi; break; }
    }
    if (found === -1) return true;

    const newValidLen = validLen - 1;
    this.activeSwaps?.push([slotId, found, newValidLen]);
    ws[found] = ws[newValidLen];
    ws[newValidLen] = wordIdx;
    this.slotValidLen[slotId] = newValidLen;

    if (newValidLen === 0) {
      this.propagateQueue.length = 0;
      this.propagateQueueHead = 0;
      return false;
    }
    if (newValidLen === 1 && !this.propagateForcedSlot(slotId)) return false;

    return this.decrementSupportForWord(wordIdx, slotId, slot);
  }

  // Remove a word by string from a slot (used in setPlacedLetters path)
  private removeWordFromSlot(word: string, slotId: number): boolean {
    const wordIdx = this.stringToWordIdx.get(word);
    if (wordIdx === undefined) return true;
    return this.removeWordFromSlotByIdx(wordIdx, slotId);
  }

  private applyWord(slotId: number, wordIdx: number): boolean {
    const slot = this.slots[slotId];
    const size = this.size;
    for (let p = 0; p < slot.len; p++) {
      const li = this.encodedWords[wordIdx * this.encodedMaxLen + p];
      const ccIdx = slot.cells[p].row * size + slot.cells[p].col;
      const clo = this.cellMasksLo[ccIdx], chi = this.cellMasksHi[ccIdx];
      const newLo = onlyLo(clo, li);
      const newHi = onlyHi(chi, li);
      if (newLo === clo && newHi === chi) continue;
      this.updateCellMask(ccIdx, newLo, newHi);
      if (newLo === 0 && newHi === 0) {
        this.propagateQueue.length = 0;
        this.propagateQueueHead = 0;
        return false;
      }
      this.propagateQueue.push([ccIdx, clo & ~newLo, chi & ~newHi]);
    }
    return this.propagate();
  }

  private pickSlot(): number {
    let bestSlot = -1;
    let bestCount = Infinity;
    for (let si = 0; si < this.numSlots; si++) {
      if (this.slotUndecidedCount[si] === 0) continue;
      const vl = this.slotValidLen[si];
      if (vl < bestCount) { bestCount = vl; bestSlot = si; }
    }
    return bestSlot;
  }

  private pushFrame(slotId: number, wordIdx: number): void {
    const wordSwaps: Array<[number, number, number]> = [];
    const attemptedAdded: Array<[number, number]> = [];
    this.stack.push({
      cellMasksLo: this.cellMasksLo.slice(),
      cellMasksHi: this.cellMasksHi.slice(),
      slotValidLen: this.slotValidLen.slice(),
      wordSupport: this.wordSupport.slice(),
      slotUndecidedCount: this.slotUndecidedCount.slice(),
      slotId,
      wordTried: wordIdx,
      wordSwaps,
      attemptedAdded,
      undecidedCells: this.undecidedCells,
    });
    this.activeSwaps = wordSwaps;
  }

  private popFrame(): void {
    const frame = this.stack.pop()!;
    this.cellMasksLo.set(frame.cellMasksLo);
    this.cellMasksHi.set(frame.cellMasksHi);
    this.slotValidLen.set(frame.slotValidLen);
    this.wordSupport.set(frame.wordSupport);
    this.slotUndecidedCount.set(frame.slotUndecidedCount);
    this.undecidedCells = frame.undecidedCells;
    // Undo word swaps in reverse to restore slotWords order
    const swaps = frame.wordSwaps;
    for (let i = swaps.length - 1; i >= 0; i--) {
      const [si, posA, posB] = swaps[i];
      const ws = this.slotWords[si];
      const tmp = ws[posA]; ws[posA] = ws[posB]; ws[posB] = tmp;
    }
    this.activeSwaps = this.stack.length > 0 ? this.stack[this.stack.length - 1].wordSwaps : null;
    // Undo attempted additions from this frame's subtree
    for (let i = frame.attemptedAdded.length - 1; i >= 0; i--) {
      const [sid, w] = frame.attemptedAdded[i];
      this.attempted.get(sid)?.delete(w);
    }
    // Record this frame's tried word, propagate to parent's log
    if (!this.attempted.has(frame.slotId)) this.attempted.set(frame.slotId, new Set<number>());
    this.attempted.get(frame.slotId)!.add(frame.wordTried);
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].attemptedAdded.push([frame.slotId, frame.wordTried]);
    }
    this.backtracks++;
  }

  step(n: number): boolean {
    if (this.finished) return true;

    while (n-- > 0 && this.steps < this.maxSteps) {
      this.steps++;
      if (Date.now() > this.deadline) {
        this.timedOut = true;
        this.finished = true;
        return true;
      }

      if (this.undecidedCells === 0) {
        this.succeeded = true;
        this.finished = true;
        return true;
      }

      const slotId = this.pickSlot();
      if (slotId === -1) {
        this.succeeded = true;
        this.finished = true;
        return true;
      }

      const triedSet = this.attempted.get(slotId) ?? new Set<number>();
      const validLen = this.slotValidLen[slotId];
      const ws = this.slotWords[slotId];

      const bankCandidates: number[] = [];
      const nonBankCandidates: number[] = [];
      for (let wi = 0; wi < validLen; wi++) {
        const w = ws[wi];
        if (triedSet.has(w)) continue;
        if (this.bankSet.has(w)) bankCandidates.push(w);
        else nonBankCandidates.push(w);
      }

      const candidates = bankCandidates.length > 0 ? bankCandidates : nonBankCandidates;

      if (candidates.length === 0) {
        if (this.stack.length === 0) {
          this.finished = true;
          return true;
        }
        this.popFrame();
        continue;
      }

      const wordIdx = seededSample(candidates, this.rng);
      this.pushFrame(slotId, wordIdx);

      // Remove from same-length slots first (uniqueness enforcement)
      let ok = true;
      const sameLen = this.slotsByLength.get(this.slots[slotId].len) ?? [];
      for (const si of sameLen) {
        if (si === slotId) continue;
        if (!this.removeWordFromSlotByIdx(wordIdx, si)) { ok = false; break; }
      }
      if (ok) ok = this.applyWord(slotId, wordIdx);
      if (!ok) this.popFrame();
    }

    if (this.steps >= this.maxSteps) {
      this.finished = true;
      return true;
    }
    return false;
  }

  setPlacedLetters(placedLetters: Map<string, string>): boolean {
    const size = this.size;
    const alpha = this.alphabet;
    placedLetters.forEach((letter, key) => {
      if (!alpha.hasLetter(letter)) return;
      const [rs, cs] = key.split(',');
      const r = parseInt(rs, 10), c = parseInt(cs, 10);
      if (this.blacks[r][c]) return;
      const li = alpha.letterIndex(letter);
      const ccIdx = r * size + c;
      const clo = this.cellMasksLo[ccIdx], chi = this.cellMasksHi[ccIdx];
      const newLo = onlyLo(clo, li);
      const newHi = onlyHi(chi, li);
      if (newLo === clo && newHi === chi) return;
      this.updateCellMask(ccIdx, newLo, newHi);
      this.propagateQueue.push([ccIdx, clo & ~newLo, chi & ~newHi]);
    });
    const ok = this.propagate();
    if (!ok) {
      this.finished = true;
      this.succeeded = false;
    }
    return ok;
  }

  deduplicateAfterPinning(): boolean {
    const size = this.size;
    const usedWords = new Set<string>();

    for (const slot of this.slots) {
      let determined = true;
      const chars: string[] = [];
      for (const { row, col } of slot.cells) {
        const mask: LetterMask = { lo: this.cellMasksLo[row * size + col], hi: this.cellMasksHi[row * size + col] };
        if (this.alphabet.isEmpty(mask) || !this.alphabet.isSingleLetter(mask)) { determined = false; break; }
        chars.push(this.alphabet.getSingleLetter(mask));
      }
      if (determined) usedWords.add(chars.join(''));
    }

    for (const word of Array.from(usedWords)) {
      const len = word.length;
      const sameLen = this.slotsByLength.get(len) ?? [];
      for (const si of sameLen) {
        const slot = this.slots[si];
        let determined = true;
        for (const { row, col } of slot.cells) {
          const mask: LetterMask = { lo: this.cellMasksLo[row * size + col], hi: this.cellMasksHi[row * size + col] };
          if (this.alphabet.isEmpty(mask) || !this.alphabet.isSingleLetter(mask)) { determined = false; break; }
        }
        if (determined) continue;
        if (!this.removeWordFromSlot(word, si)) return false;
      }
      if (!this.propagate()) {
        this.finished = true;
        this.succeeded = false;
        return false;
      }
    }
    return true;
  }

  getOptions(): string[][][] {
    const size = this.size;
    const alpha = this.alphabet;
    return Array.from({ length: size }, (_u, r) =>
      Array.from({ length: size }, (_u2, c) => {
        if (this.blacks[r][c]) return [];
        const mask: LetterMask = { lo: this.cellMasksLo[r * size + c], hi: this.cellMasksHi[r * size + c] };
        if (alpha.isEmpty(mask)) return [];
        return alpha.getLetters(mask);
      })
    );
  }

  private countCells(): { filledCells: number; totalCells: number } {
    const size = this.size;
    let filledCells = 0, totalCells = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.blacks[r][c]) continue;
        totalCells++;
        const lo = this.cellMasksLo[r * size + c], hi = this.cellMasksHi[r * size + c];
        if (isSingleLetterRaw(lo, hi)) filledCells++;
      }
    }
    return { filledCells, totalCells };
  }

  getProgressUpdate(): FillProgressUpdate {
    const { filledCells, totalCells } = this.countCells();
    return {
      cellMasksLo: this.cellMasksLo.slice(),
      cellMasksHi: this.cellMasksHi.slice(),
      steps: this.steps,
      backtracks: this.backtracks,
      done: this.finished,
      success: this.succeeded,
      filledCells,
      totalCells,
    };
  }

  getResult(): FillResult {
    const size = this.size;
    const alpha = this.alphabet;
    const grid: string[][] = Array.from({ length: size }, (_u, r) =>
      Array.from({ length: size }, (_u2, c) => {
        if (this.blacks[r][c]) return '.';
        const lo = this.cellMasksLo[r * size + c], hi = this.cellMasksHi[r * size + c];
        if (isSingleLetterRaw(lo, hi)) {
          const mask: LetterMask = { lo, hi };
          return alpha.getSingleLetter(mask);
        }
        return ' ';
      })
    );
    const { filledCells, totalCells } = this.countCells();
    const success = this.succeeded;
    const failureReason: FillFailureReason | null = success ? null
      : this.timedOut ? 'timeout'
      : this.steps >= this.maxSteps ? 'maxSteps'
      : 'noValidFill';
    return {
      success,
      timedOut: this.timedOut,
      failureReason,
      grid,
      slots: this.slots.map(s => ({ cells: s.cells, direction: s.direction })),
      steps: this.steps,
      backtracks: this.backtracks,
      timeMs: Date.now() - this.startTime,
      filledCells,
      totalCells,
    };
  }
}

export function createFillEngine(config: FillConfig): FillEngineInstance {
  return new FillEngineInstance(config);
}

export function fillGrid(config: FillConfig): FillResult {
  const engine = new FillEngineInstance(config);
  while (!engine.step(10000)) { /* loop */ }
  return engine.getResult();
}

export function propagateConstraints(config: PropagateConfig): PropagateResult {
  const engine = new FillEngineInstance({
    size: config.size,
    blacks: config.blacks,
    wordsByLength: config.wordsByLength,
    alphabet: config.alphabet,
    seed: 0,
    timeoutMs: 0,
    maxSteps: 0,
  });
  const ok = engine.setPlacedLetters(config.placedLetters);
  return { options: engine.getOptions(), contradiction: !ok };
}

// ---------------------------------------------------------------------------
// Clue numbering and slot lookup
// ---------------------------------------------------------------------------

export interface ClueSlot {
  cells: Array<{ row: number; col: number }>;
  direction: 'across' | 'down';
  word?: string;
}

export function buildClueMap(
  size: number,
  blacks: boolean[][],
  solvedGrid?: string[][]
): Map<string, ClueSlot> {
  const isBlack = (r: number, c: number) =>
    r < 0 || r >= size || c < 0 || c >= size || blacks[r][c];

  const result = new Map<string, ClueSlot>();
  let num = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isBlack(r, c)) continue;
      const startsAcross = isBlack(r, c - 1) && !isBlack(r, c + 1);
      const startsDown = isBlack(r - 1, c) && !isBlack(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      num++;

      if (startsAcross) {
        const cells: Array<{ row: number; col: number }> = [];
        let cc = c;
        while (!isBlack(r, cc)) cells.push({ row: r, col: cc++ });
        const word = solvedGrid
          ? cells.map(({ row, col }) => solvedGrid[row][col]).join('')
          : undefined;
        result.set(`${num}A`, { cells, direction: 'across', word });
      }
      if (startsDown) {
        const cells: Array<{ row: number; col: number }> = [];
        let rr = r;
        while (!isBlack(rr, c)) cells.push({ row: rr++, col: c });
        const word = solvedGrid
          ? cells.map(({ row, col }) => solvedGrid[row][col]).join('')
          : undefined;
        result.set(`${num}D`, { cells, direction: 'down', word });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Solve validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSolvedGrid(
  solvedGrid: string[][],
  blacks: boolean[][],
  wordsByLength: Map<number, string[]>,
  bankWords?: Set<string>,
  allowEmpty?: boolean,
  alphabet?: Alphabet
): ValidationResult {
  const size = solvedGrid.length;
  const errors: string[] = [];
  const validCharSet = alphabet ? new Set(alphabet.letters) : null;
  const isValidChar = (ch: string) => validCharSet ? validCharSet.has(ch) : (ch >= 'a' && ch <= 'z');
  const isValidWord = (w: string) => w.length > 0 && Array.from(w).every(isValidChar);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!blacks[r][c] && !(allowEmpty && solvedGrid[r][c] === '') && !isValidChar(solvedGrid[r][c])) {
        errors.push(`Cell (${r},${c}) is not a letter: "${solvedGrid[r][c]}"`);
      }
    }
  }

  const clueMap = buildClueMap(size, blacks, solvedGrid);
  const usedWords = new Map<string, string>();

  clueMap.forEach((slot, label) => {
    const word = slot.word ?? '';
    if (!isValidWord(word)) {
      if (allowEmpty) return;
      errors.push(`${label}: invalid word "${word}"`);
      return;
    }
    const inDict = (wordsByLength.get(word.length) ?? []).includes(word);
    const inBank = bankWords?.has(word) ?? false;
    if (!inDict && !inBank) {
      errors.push(`${label}: "${word}" not in dictionary or bank`);
    }
    if (usedWords.has(word)) {
      errors.push(`${label}: "${word}" duplicates ${usedWords.get(word)}`);
    } else {
      usedWords.set(word, label);
    }
  });

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Revision fill — replace one or more slots in a completed grid
// ---------------------------------------------------------------------------

export interface RevisionFillConfig {
  solvedGrid: string[][];
  blacks: boolean[][];
  wordsByLength: Map<number, string[]>;
  bannedWords: string[];
  removedSlotCells: Array<Array<{ row: number; col: number }>>;
  lockedSlotCells?: Array<Array<{ row: number; col: number }>>;
  bankWords?: string[];
  seed?: number;
  timeoutMs?: number;
  alphabet?: Alphabet;
}

function revisionBuildPinnedCells(
  solvedGrid: string[][],
  slots: SlotTopology['slots'],
  freeSet: Set<number>
): Map<string, string> {
  const pinned = new Map<string, string>();
  for (const slot of slots) {
    if (freeSet.has(slot.id)) continue;
    for (const { row, col } of slot.cells) {
      pinned.set(`${row},${col}`, solvedGrid[row][col]);
    }
  }
  return pinned;
}

function revisionCompatibleWordCount(
  slot: SlotTopology['slots'][number],
  pinnedCells: Map<string, string>,
  wordsByLength: Map<number, string[]>
): number {
  const words = wordsByLength.get(slot.len) ?? [];
  return words.filter(w =>
    slot.cells.every(({ row, col }, i) => {
      const pin = pinnedCells.get(`${row},${col}`);
      return pin === undefined || w[i] === pin;
    })
  ).length;
}

function revisionFindSlotId(
  slots: SlotTopology['slots'],
  cells: Array<{ row: number; col: number }>
): number {
  const key = (c: { row: number; col: number }) => `${c.row},${c.col}`;
  const targetKeys = new Set(cells.map(key));
  for (const slot of slots) {
    if (slot.cells.length === cells.length && slot.cells.every(c => targetKeys.has(key(c)))) return slot.id;
  }
  const first = cells[0];
  for (const slot of slots) {
    if (slot.cells.length === cells.length && slot.cells[0].row === first.row && slot.cells[0].col === first.col) return slot.id;
  }
  return -1;
}

function revisionTryFill(
  freeSet: Set<number>,
  filteredWords: Map<number, string[]>,
  slots: SlotTopology['slots'],
  solvedGrid: string[][],
  blacks: boolean[][],
  bankWords: string[],
  seed: number,
  timeoutMs: number,
  alphabet: Alphabet
): FillResult | null {
  const size = blacks.length;
  const pinnedCells = revisionBuildPinnedCells(solvedGrid, slots, freeSet);
  const engine = createFillEngine({ size, blacks, wordsByLength: filteredWords, bankWords, seed, timeoutMs, alphabet });
  if (pinnedCells.size > 0 && !engine.setPlacedLetters(pinnedCells)) return null;
  if (!engine.deduplicateAfterPinning()) return null;
  while (!engine.step(10000)) { /* loop */ }
  const result = engine.getResult();
  return result.success ? result : null;
}

export function runRevisionFill(config: RevisionFillConfig): FillResult | null {
  const {
    solvedGrid, blacks, bannedWords,
    removedSlotCells, lockedSlotCells = [],
    bankWords = [], seed = 0, timeoutMs = 30000,
    alphabet = ENGLISH,
  } = config;

  const bannedSet = new Set(bannedWords);
  const filteredWords = new Map<number, string[]>();
  config.wordsByLength.forEach((words, len) => {
    filteredWords.set(len, words.filter(w => !bannedSet.has(w)));
  });
  const filteredBankWords = bankWords.filter(w => !bannedSet.has(w));

  const { slots } = buildSlotTopology(blacks.length, blacks);

  const crossingMap = new Map<number, Set<number>>();
  for (const slot of slots) {
    const s = new Set<number>();
    for (const c of slot.crossings) { if (c) s.add(c.slotId); }
    crossingMap.set(slot.id, s);
  }

  const removedIds = removedSlotCells
    .map(cells => revisionFindSlotId(slots, cells))
    .filter(id => id !== -1);
  if (removedIds.length === 0) return null;

  const lockedIds = new Set(
    lockedSlotCells
      .map(cells => revisionFindSlotId(slots, cells))
      .filter(id => id !== -1)
  );

  const freeSet = new Set(removedIds);
  const visited = new Set(removedIds);
  let frontier = new Set(removedIds);

  while (true) {
    const result = revisionTryFill(freeSet, filteredWords, slots, solvedGrid, blacks, filteredBankWords, seed, timeoutMs, alphabet);
    if (result) return result;

    const ring: number[] = [];
    frontier.forEach(slotId => {
      (crossingMap.get(slotId) ?? new Set()).forEach(crossId => {
        if (!visited.has(crossId) && !lockedIds.has(crossId)) {
          ring.push(crossId);
          visited.add(crossId);
        }
      });
    });

    if (ring.length === 0) return null;

    const pinnedForSort = revisionBuildPinnedCells(solvedGrid, slots, freeSet);
    ring.sort((a, b) =>
      revisionCompatibleWordCount(slots[a], pinnedForSort, filteredWords) -
      revisionCompatibleWordCount(slots[b], pinnedForSort, filteredWords)
    );

    frontier = new Set<number>();
    for (const slotId of ring) {
      freeSet.add(slotId);
      frontier.add(slotId);
      const r = revisionTryFill(freeSet, filteredWords, slots, solvedGrid, blacks, bankWords, seed, timeoutMs, alphabet);
      if (r) return r;
    }
  }
}
