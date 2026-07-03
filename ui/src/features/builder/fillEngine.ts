/**
 * Fill engine — string-based crossword filling with queue-based AC propagation.
 * Uses LetterMask = {lo, hi} for up to 64-letter alphabets. Correctness first.
 */

import { Alphabet, LetterMask, MutableLetterMask, ENGLISH } from './Alphabet';

// ---------------------------------------------------------------------------
// Inline LetterMask helpers (module-scope)
// ---------------------------------------------------------------------------

const EMPTY_MASK: LetterMask = { lo: 0, hi: 0 };
function maskEmpty(m: LetterMask): boolean { return m.lo === 0 && m.hi === 0; }
function maskSingle(m: LetterMask): boolean {
  return (m.lo !== 0 && (m.lo & (m.lo - 1)) === 0 && m.hi === 0) ||
         (m.lo === 0 && m.hi !== 0 && (m.hi & (m.hi - 1)) === 0);
}
function maskAnd(a: LetterMask, b: LetterMask): LetterMask { return { lo: a.lo & b.lo, hi: a.hi & b.hi }; }
// maskOr kept for propagateConstraints
function maskOr(a: LetterMask, b: LetterMask): LetterMask { return { lo: a.lo | b.lo, hi: a.hi | b.hi }; }
function maskAccumulate(acc: MutableLetterMask, m: LetterMask): void { acc.lo |= m.lo; acc.hi |= m.hi; }
function maskContains(m: LetterMask, bit: LetterMask): boolean { return (m.lo & bit.lo) !== 0 || (m.hi & bit.hi) !== 0; }
function maskEquals(a: LetterMask, b: LetterMask): boolean { return a.lo === b.lo && a.hi === b.hi; }
function maskHasMultiple(m: LetterMask): boolean { return !maskEmpty(m) && !maskSingle(m); }
function maskRemoveBit(m: LetterMask, bit: LetterMask): LetterMask { return { lo: m.lo & ~bit.lo, hi: m.hi & ~bit.hi }; }

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

// Seeded PRNG (mulberry32)
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

// ---------------------------------------------------------------------------
// Slot topology
// ---------------------------------------------------------------------------

export function buildSlotTopology(size: number, blacks: boolean[][]): SlotTopology {
  const slots: SlotTopology['slots'] = [];
  const cellToSlots: SlotTopology['cellToSlots'] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [])
  );

  const dirs: Array<[number, number, 'across' | 'down']> = [
    [0, 1, 'across'],
    [1, 0, 'down'],
  ];
  for (const [dr, dc, dir] of dirs) {
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
// FillEngineInstance
// ---------------------------------------------------------------------------

interface InternalSlot {
  id: number;
  cells: Array<{ row: number; col: number }>;
  direction: 'across' | 'down';
  len: number;
}

interface StackFrame {
  slotId: number;
  word: string;
  cellMasks: LetterMask[];
  slotCandidates: string[][];
  attempted: Map<number, Set<string>>;
  wordSupport: Int32Array;
}

export class FillEngineInstance {
  private size: number;
  private blacks: boolean[][];
  private alphabet: Alphabet;
  private wordsByLength: Map<number, string[]>;
  private bankWordsSet: Set<string>;
  private rng: () => number;
  private deadline: number;
  private maxSteps: number;

  private slots: InternalSlot[];
  private cellToSlots: Array<Array<Array<{ slotId: number; posInSlot: number }>>>;
  private cellMasks: LetterMask[]; // flat size*size
  private slotCandidates: string[][];
  private attempted: Map<number, Set<string>> = new Map();
  private stack: StackFrame[] = [];

  // AC propagation state
  private alphaSize: number;
  private maxSlotLen: number;
  // wordSupport[si * maxSlotLen * alphaSize + p * alphaSize + li] = number of
  // candidates in slotCandidates[si] that have letter li at position p.
  private wordSupport: Int32Array;
  private slotsByLength: Map<number, number[]>; // length → slot indices
  private propagateQueue: Array<[number, number, number]>; // [cellIdx, removedLo, removedHi]

  private steps = 0;
  private backtracks = 0;
  private timedOut = false;
  private finished = false;
  private succeeded = false;
  private startTime = Date.now();

  constructor(config: FillConfig) {
    const {
      size,
      blacks,
      wordsByLength,
      bankWords = [],
      seed = 42,
      timeoutMs = 10000,
      maxSteps = 400000,
    } = config;
    this.alphabet = config.alphabet ?? ENGLISH;
    this.size = size;
    this.blacks = blacks;
    this.wordsByLength = wordsByLength;
    this.bankWordsSet = new Set(bankWords);
    this.rng = makePRNG(seed);
    this.deadline = timeoutMs === Infinity ? Date.now() + 1e15 : Date.now() + timeoutMs;
    this.maxSteps = maxSteps === 0 ? Infinity : maxSteps;

    const topo = buildSlotTopology(size, blacks);
    this.slots = topo.slots.map(s => ({
      id: s.id, cells: s.cells, direction: s.direction, len: s.len,
    }));
    this.cellToSlots = topo.cellToSlots;

    // Initialize cell masks
    this.cellMasks = new Array(size * size).fill(EMPTY_MASK);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        this.cellMasks[r * size + c] = blacks[r][c] ? EMPTY_MASK : this.alphabet.ALL;
      }
    }

    // Initialize slot candidates: bank words first, then dict
    this.slotCandidates = this.slots.map(slot => {
      const dictWords = wordsByLength.get(slot.len) ?? [];
      const bankMatch = bankWords.filter(w => w.length === slot.len);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const w of bankMatch) {
        if (!seen.has(w) && this.wordValid(w)) { seen.add(w); out.push(w); }
      }
      for (const w of dictWords) {
        if (!seen.has(w) && this.wordValid(w)) { seen.add(w); out.push(w); }
      }
      return out;
    });

    // AC propagation setup
    this.alphaSize = this.alphabet.size;
    this.maxSlotLen = this.slots.reduce((max, s) => Math.max(max, s.len), 1);
    this.wordSupport = new Int32Array(this.slots.length * this.maxSlotLen * this.alphaSize);
    this.slotsByLength = new Map<number, number[]>();
    for (let si = 0; si < this.slots.length; si++) {
      const len = this.slots[si].len;
      if (!this.slotsByLength.has(len)) this.slotsByLength.set(len, []);
      this.slotsByLength.get(len)!.push(si);
    }
    this.propagateQueue = [];
    for (let si = 0; si < this.slots.length; si++) {
      this.initSlotSupport(si);
    }

    // Slots starting with exactly 1 candidate must eliminate that word from
    // same-length slots now, before seeding constraints.
    for (let si = 0; si < this.slots.length; si++) {
      if (this.slotCandidates[si].length === 1) {
        if (!this.propagateForcedSlot(si)) {
          this.propagateQueue = [];
          this.finished = true;
          this.succeeded = false;
          return;
        }
      }
    }

    // Seed queue with letters that have no support, then propagate to fixed point
    this.seedInitialConstraints();
    if (!this.propagate()) {
      this.finished = true;
      this.succeeded = false;
    }
  }

  private wordValid(w: string): boolean {
    for (let i = 0; i < w.length; i++) {
      if (!this.alphabet.hasLetter(w[i])) return false;
    }
    return true;
  }

  private cellIdx(r: number, c: number): number {
    return r * this.size + c;
  }

  private supportIdx(si: number, p: number, li: number): number {
    return si * this.maxSlotLen * this.alphaSize + p * this.alphaSize + li;
  }

  // Initialize (or reinitialize) wordSupport counts for slot si from slotCandidates[si].
  private initSlotSupport(si: number): void {
    const slot = this.slots[si];
    const base = si * this.maxSlotLen * this.alphaSize;
    for (let p = 0; p < slot.len; p++)
      for (let li = 0; li < this.alphaSize; li++)
        this.wordSupport[base + p * this.alphaSize + li] = 0;
    for (const w of this.slotCandidates[si])
      for (let p = 0; p < slot.len; p++)
        this.wordSupport[base + p * this.alphaSize + this.alphabet.letterIndex(w[p])]++;
  }

  // For each (slot, position), find letters with zero support and enqueue their removal.
  private seedInitialConstraints(): void {
    for (let si = 0; si < this.slots.length; si++) {
      const slot = this.slots[si];
      const base = si * this.maxSlotLen * this.alphaSize;
      for (let p = 0; p < slot.len; p++) {
        const cIdx = this.cellIdx(slot.cells[p].row, slot.cells[p].col);
        const oldMask = this.cellMasks[cIdx];
        const supported: MutableLetterMask = { lo: 0, hi: 0 };
        for (let li = 0; li < this.alphaSize; li++) {
          if (this.wordSupport[base + p * this.alphaSize + li] > 0) {
            maskAccumulate(supported, this.alphabet.onlyLetterAt(li));
          }
        }
        const newMask = maskAnd(oldMask, supported);
        if (!maskEquals(newMask, oldMask)) {
          this.cellMasks[cIdx] = newMask;
          this.propagateQueue.push([cIdx, oldMask.lo & ~newMask.lo, oldMask.hi & ~newMask.hi]);
        }
      }
    }
  }

  // Decrement wordSupport for each position of `word` in slot `si`.
  // When support for a letter hits 0, remove it from the cell mask and enqueue.
  // Returns false on contradiction (empty cell mask).
  private decrementWordSupport(si: number, word: string): boolean {
    const slot = this.slots[si];
    const base = si * this.maxSlotLen * this.alphaSize;
    for (let p = 0; p < slot.len; p++) {
      const li = this.alphabet.letterIndex(word[p]);
      const sIdx = base + p * this.alphaSize + li;
      this.wordSupport[sIdx]--;
      if (this.wordSupport[sIdx] === 0) {
        const cIdx = this.cellIdx(slot.cells[p].row, slot.cells[p].col);
        const letterMask = this.alphabet.forLetter(word[p]);
        const oldMask = this.cellMasks[cIdx];
        if (!maskContains(oldMask, letterMask)) continue;
        const newMask = maskRemoveBit(oldMask, letterMask);
        if (maskEmpty(newMask)) {
          this.propagateQueue.length = 0;
          return false;
        }
        this.cellMasks[cIdx] = newMask;
        this.propagateQueue.push([cIdx, oldMask.lo & ~newMask.lo, oldMask.hi & ~newMask.hi]);
      }
    }
    return true;
  }

  // Remove `word` from slot `si`'s candidates and update support counts.
  // Handles forced-slot detection (1 candidate remaining).
  // Returns false on contradiction.
  private removeWordFromSlot(si: number, word: string): boolean {
    const arr = this.slotCandidates[si];
    const idx = arr.indexOf(word);
    if (idx === -1) return true;
    arr.splice(idx, 1);
    if (!this.decrementWordSupport(si, word)) return false;
    if (arr.length === 0 && (this.wordsByLength.get(this.slots[si].len)?.length ?? 0) > 0) {
      this.propagateQueue.length = 0;
      return false;
    }
    if (arr.length === 1) {
      if (!this.propagateForcedSlot(si)) return false;
    }
    return true;
  }

  // When slot `si` has exactly 1 candidate, remove that word from all same-length slots
  // to enforce uniqueness.
  private propagateForcedSlot(si: number): boolean {
    if (this.slotCandidates[si].length !== 1) return true;
    const word = this.slotCandidates[si][0];
    const len = this.slots[si].len;
    for (const other of (this.slotsByLength.get(len) ?? [])) {
      if (other === si) continue;
      if (!this.removeWordFromSlot(other, word)) return false;
    }
    return true;
  }

  // Drain the propagation queue. For each cell update, remove candidates from
  // crossing slots that have a removed letter at the crossing position.
  private propagate(): boolean {
    while (this.propagateQueue.length > 0) {
      const [cIdx, removedLo, removedHi] = this.propagateQueue.shift()!;
      const r = Math.floor(cIdx / this.size);
      const c = cIdx % this.size;
      for (const { slotId: si, posInSlot } of this.cellToSlots[r][c]) {
        const toRemove: string[] = [];
        for (const w of this.slotCandidates[si]) {
          const bit = this.alphabet.forLetter(w[posInSlot]);
          if ((bit.lo & removedLo) !== 0 || (bit.hi & removedHi) !== 0) {
            toRemove.push(w);
          }
        }
        for (const w of toRemove) {
          if (!this.removeWordFromSlot(si, w)) return false;
        }
      }
    }
    return true;
  }

  setPlacedLetters(placedLetters: Map<string, string>): boolean {
    for (const [key, letter] of placedLetters) {
      const [rs, cs] = key.split(',');
      const r = parseInt(rs, 10), c = parseInt(cs, 10);
      if (!this.alphabet.hasLetter(letter)) {
        this.finished = true;
        this.succeeded = false;
        return false;
      }
      if (this.blacks[r][c]) continue;
      const cIdx = this.cellIdx(r, c);
      const oldMask = this.cellMasks[cIdx];
      const newMask = this.alphabet.forLetter(letter);
      if (!maskEquals(newMask, oldMask)) {
        this.cellMasks[cIdx] = newMask;
        this.propagateQueue.push([cIdx, oldMask.lo & ~newMask.lo, oldMask.hi & ~newMask.hi]);
      }
    }
    const ok = this.propagate();
    if (!ok) {
      this.finished = true;
      this.succeeded = false;
      return false;
    }
    if (!this.checkWordUniqueness()) {
      this.finished = true;
      this.succeeded = false;
      return false;
    }
    return true;
  }

  // Check that no two decided slots of the same length share the same word.
  private checkWordUniqueness(): boolean {
    const usedByLength = new Map<number, Set<string>>();
    for (const slot of this.slots) {
      let decided = true;
      let word = '';
      for (const { row, col } of slot.cells) {
        const m = this.cellMasks[this.cellIdx(row, col)];
        if (!maskSingle(m)) { decided = false; break; }
        word += this.alphabet.getSingleLetter(m);
      }
      if (!decided) continue;
      let seen = usedByLength.get(slot.len);
      if (!seen) { seen = new Set<string>(); usedByLength.set(slot.len, seen); }
      if (seen.has(word)) return false;
      seen.add(word);
    }
    return true;
  }

  // Pick slot with fewest candidates that still has undecided cells
  private pickSlot(): number {
    let best = -1;
    let bestCount = Infinity;
    for (let si = 0; si < this.slots.length; si++) {
      const slot = this.slots[si];
      let undecided = false;
      for (const { row, col } of slot.cells) {
        const m = this.cellMasks[this.cellIdx(row, col)];
        if (maskHasMultiple(m)) { undecided = true; break; }
      }
      if (!undecided) continue;
      const n = this.slotCandidates[si].length;
      if (n < bestCount) { bestCount = n; best = si; }
    }
    return best;
  }

  private applyWord(slotId: number, word: string): boolean {
    const slot = this.slots[slotId];

    // Remove word from same-length slots (uniqueness) before pinning, so their
    // support counts are decremented while slotCandidates[slotId] is still full.
    for (const other of (this.slotsByLength.get(slot.len) ?? [])) {
      if (other === slotId) continue;
      if (!this.removeWordFromSlot(other, word)) return false;
    }

    // Pin each cell in this slot to the word's letter, enqueue any removals
    for (let p = 0; p < slot.len; p++) {
      const cIdx = this.cellIdx(slot.cells[p].row, slot.cells[p].col);
      const oldMask = this.cellMasks[cIdx];
      const newMask = this.alphabet.forLetter(word[p]);
      if (!maskEquals(newMask, oldMask)) {
        this.cellMasks[cIdx] = newMask;
        this.propagateQueue.push([cIdx, oldMask.lo & ~newMask.lo, oldMask.hi & ~newMask.hi]);
      }
    }

    // Commit this slot to the single candidate and rebuild its support counts
    this.slotCandidates[slotId] = [word];
    this.initSlotSupport(slotId);

    return this.propagate();
  }

  private pushFrame(slotId: number, word: string): void {
    const attemptedCopy = new Map<number, Set<string>>();
    this.attempted.forEach((v, k) => attemptedCopy.set(k, new Set(v)));
    this.stack.push({
      slotId,
      word,
      cellMasks: this.cellMasks.slice(),
      slotCandidates: this.slotCandidates.map(a => a.slice()),
      attempted: attemptedCopy,
      wordSupport: this.wordSupport.slice(),
    });
  }

  private popFrame(): void {
    const frame = this.stack.pop()!;
    this.cellMasks = frame.cellMasks;
    this.slotCandidates = frame.slotCandidates;
    this.attempted = frame.attempted;
    this.wordSupport = frame.wordSupport;
    this.propagateQueue = [];
    let set = this.attempted.get(frame.slotId);
    if (!set) { set = new Set<string>(); this.attempted.set(frame.slotId, set); }
    set.add(frame.word);
    this.backtracks++;
  }

  step(n: number): boolean {
    if (this.finished) return true;

    for (let i = 0; i < n; i++) {
      if (this.steps >= this.maxSteps) {
        this.finished = true;
        return true;
      }
      if (Date.now() > this.deadline) {
        this.timedOut = true;
        this.finished = true;
        return true;
      }
      this.steps++;

      const slotId = this.pickSlot();
      if (slotId === -1) {
        this.succeeded = true;
        this.finished = true;
        return true;
      }

      const tried = this.attempted.get(slotId) ?? new Set<string>();
      const cands = this.slotCandidates[slotId].filter(w => !tried.has(w));

      const bankCands = cands.filter(w => this.bankWordsSet.has(w));
      const useCands = bankCands.length > 0 ? bankCands : cands;

      if (useCands.length === 0) {
        if (this.stack.length === 0) {
          this.finished = true;
          this.succeeded = false;
          return true;
        }
        this.popFrame();
        continue;
      }

      const word = useCands[Math.floor(this.rng() * useCands.length)];
      this.pushFrame(slotId, word);
      const ok = this.applyWord(slotId, word);
      if (!ok) {
        this.popFrame();
      }
    }
    return false;
  }

  getOptions(): string[][][] {
    const out: string[][][] = [];
    for (let r = 0; r < this.size; r++) {
      const row: string[][] = [];
      for (let c = 0; c < this.size; c++) {
        if (this.blacks[r][c]) row.push([]);
        else row.push(this.alphabet.getLetters(this.cellMasks[this.cellIdx(r, c)]));
      }
      out.push(row);
    }
    return out;
  }

  private countCells(): { filledCells: number; totalCells: number } {
    let filled = 0, total = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.blacks[r][c]) continue;
        total++;
        const m = this.cellMasks[this.cellIdx(r, c)];
        if (maskSingle(m)) filled++;
      }
    }
    return { filledCells: filled, totalCells: total };
  }

  getProgressUpdate(): FillProgressUpdate {
    const { filledCells, totalCells } = this.countCells();
    const n = this.size * this.size;
    const lo = new Int32Array(n);
    const hi = new Int32Array(n);
    for (let i = 0; i < n; i++) { lo[i] = this.cellMasks[i].lo; hi[i] = this.cellMasks[i].hi; }
    return {
      cellMasksLo: lo,
      cellMasksHi: hi,
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
    const grid: string[][] = [];
    for (let r = 0; r < size; r++) {
      const row: string[] = [];
      for (let c = 0; c < size; c++) {
        if (this.blacks[r][c]) { row.push('.'); continue; }
        const m = this.cellMasks[this.cellIdx(r, c)];
        if (maskSingle(m)) {
          row.push(this.alphabet.getSingleLetter(m));
        } else row.push(' ');
      }
      grid.push(row);
    }
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
