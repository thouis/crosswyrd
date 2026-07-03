/**
 * Fill engine — simple string-based crossword filling with backtracking.
 * Uses LetterMask = {lo, hi} for up to 64-letter alphabets. No optimizations; correctness first.
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
function maskOr(a: LetterMask, b: LetterMask): LetterMask { return { lo: a.lo | b.lo, hi: a.hi | b.hi }; }
function maskAccumulate(acc: MutableLetterMask, m: LetterMask): void { acc.lo |= m.lo; acc.hi |= m.hi; }
function maskContains(m: LetterMask, bit: LetterMask): boolean { return (m.lo & bit.lo) !== 0 || (m.hi & bit.hi) !== 0; }
function maskEquals(a: LetterMask, b: LetterMask): boolean { return a.lo === b.lo && a.hi === b.hi; }
function maskHasMultiple(m: LetterMask): boolean { return !maskEmpty(m) && !maskSingle(m); }

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
    // Special-case timeoutMs = Infinity and maxSteps = 0
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

    // Initialize slot candidates: bank words first (matching length), then dict
    this.slotCandidates = this.slots.map(slot => {
      const dictWords = wordsByLength.get(slot.len) ?? [];
      const bankMatch = bankWords.filter(w => w.length === slot.len);
      // Dedup while preserving bank-first order
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

  // Filter slot candidates by current cell masks
  private recomputeCandidates(si: number): string[] {
    const slot = this.slots[si];
    const cands = this.slotCandidates[si];
    const out: string[] = [];
    for (const w of cands) {
      let ok = true;
      for (let p = 0; p < slot.len; p++) {
        const bit = this.alphabet.forLetter(w[p]);
        const m = this.cellMasks[this.cellIdx(slot.cells[p].row, slot.cells[p].col)];
        if (!maskContains(m, bit)) { ok = false; break; }
      }
      if (ok) out.push(w);
    }
    return out;
  }

  // Iteratively narrow cell masks based on slot candidates.
  private propagate(): boolean {
    while (true) {
      let changed = false;
      for (let si = 0; si < this.slots.length; si++) {
        const slot = this.slots[si];
        const filtered = this.recomputeCandidates(si);
        if (filtered.length !== this.slotCandidates[si].length) {
          this.slotCandidates[si] = filtered;
          changed = true;
        }
        // A slot with zero candidates is contradiction ONLY if there are dict
        // words of that length (i.e., we started with something).
        if (filtered.length === 0 && (this.wordsByLength.get(slot.len)?.length ?? 0) > 0) {
          return false;
        }

        // Narrow each cell mask to union of possible letters at position p.
        // Use a single mutable accumulator to avoid one allocation per candidate.
        const union: MutableLetterMask = { lo: 0, hi: 0 };
        for (let p = 0; p < slot.len; p++) {
          union.lo = 0; union.hi = 0;
          for (const w of filtered) {
            maskAccumulate(union, this.alphabet.forLetter(w[p]));
          }
          const idx = this.cellIdx(slot.cells[p].row, slot.cells[p].col);
          const oldMask = this.cellMasks[idx];
          if (filtered.length === 0) continue; // no dict words case; leave mask
          const newMask = maskAnd(oldMask, union);
          if (!maskEquals(newMask, oldMask)) {
            this.cellMasks[idx] = newMask;
            changed = true;
            if (maskEmpty(newMask)) return false;
          }
        }
      }
      if (!changed) break;
    }
    return true;
  }

  setPlacedLetters(placedLetters: Map<string, string>): boolean {
    const errs: string[] = [];
    placedLetters.forEach((letter, key) => {
      const [rs, cs] = key.split(',');
      const r = parseInt(rs, 10), c = parseInt(cs, 10);
      if (!this.alphabet.hasLetter(letter)) {
        errs.push(key);
        return;
      }
      const idx = this.cellIdx(r, c);
      if (this.blacks[r][c]) return;
      this.cellMasks[idx] = this.alphabet.forLetter(letter);
    });
    if (errs.length > 0) {
      this.finished = true;
      this.succeeded = false;
      return false;
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
      // Undecided if some cell has >1 possible letters
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
    // Remove from same-length slots (uniqueness)
    for (let si = 0; si < this.slots.length; si++) {
      if (si === slotId) continue;
      if (this.slots[si].len !== slot.len) continue;
      const arr = this.slotCandidates[si];
      const filtered = arr.filter(w => w !== word);
      if (filtered.length !== arr.length) this.slotCandidates[si] = filtered;
    }
    // Set cell masks to the word's letters
    for (let p = 0; p < slot.len; p++) {
      const idx = this.cellIdx(slot.cells[p].row, slot.cells[p].col);
      this.cellMasks[idx] = this.alphabet.forLetter(word[p]);
    }
    this.slotCandidates[slotId] = [word];
    return this.propagate();
  }

  private pushFrame(slotId: number, word: string): void {
    // Deep copy attempted
    const attemptedCopy = new Map<number, Set<string>>();
    this.attempted.forEach((v, k) => attemptedCopy.set(k, new Set(v)));
    this.stack.push({
      slotId,
      word,
      cellMasks: this.cellMasks.slice(),
      slotCandidates: this.slotCandidates.map(a => a.slice()),
      attempted: attemptedCopy,
    });
  }

  private popFrame(): void {
    const frame = this.stack.pop()!;
    this.cellMasks = frame.cellMasks;
    this.slotCandidates = frame.slotCandidates;
    this.attempted = frame.attempted;
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

      // Prefer bank words
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
