// PR2: fillEngine-based worker

import { expose } from 'comlink';
import _ from 'lodash';

import { Alphabet, ENGLISH } from './Alphabet';
import { CrosswordPuzzleType, LetterType } from './builderSlice';
import {
  ElementType,
  FillWaveUpdate,
  TileUpdateType,
  WaveType,
} from './useWaveFunctionCollapse';
import {
  WordIndexType,
  buildWordIndex,
  addWords as addWordsToWordIndex,
} from './wordIndex';
import {
  FillEngineInstance,
  createFillEngine,
  propagateConstraints,
} from './fillEngine';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let workerAlphabet: Alphabet = ENGLISH;
let workerWordIndex: WordIndexType | null = null;
let baseWordList: string[] = [];
const bankWords = new Set<string>();
let stopFillRequested = false;

const indexReady: Promise<void> = fetch(`${process.env.PUBLIC_URL}/word_list.json`)
  .then(r => r.json())
  .then((words: string[]) => {
    baseWordList = words;
    workerWordIndex = buildWordIndex(words, workerAlphabet);
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indexToWordsByLength(index: WordIndexType): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const lenStr of Object.keys(index.words)) {
    const len = +lenStr;
    m.set(len, index.words[len].slice());
  }
  return m;
}

function filterBannedWords(
  wordsByLength: Map<number, string[]>,
  bannedWords: string[]
): Map<number, string[]> {
  if (!bannedWords || bannedWords.length === 0) return wordsByLength;
  const banned = new Set(bannedWords);
  const out = new Map<number, string[]>();
  wordsByLength.forEach((ws, len) => {
    out.set(len, ws.filter(w => !banned.has(w)));
  });
  return out;
}

function rebuildBitsetForLength(index: WordIndexType, len: number): void {
  const alphaSize = workerAlphabet.size;
  const ws = index.words[len] ?? [];
  const s = Math.max(1, Math.ceil(ws.length / 32));
  index.stride[len] = s;
  const pb: Uint32Array[][] = Array.from({ length: len }, () =>
    Array.from({ length: alphaSize }, () => new Uint32Array(s))
  );
  for (let i = 0; i < ws.length; i++) {
    const u = i >>> 5, b = 1 << (i & 31);
    for (let p = 0; p < len; p++) {
      pb[p][workerAlphabet.letterIndex(ws[i][p])][u] |= b;
    }
  }
  index.bitsets[len] = pb;
}

// Extract blacks / placedLetters from puzzle
function extractPuzzleState(puzzle: CrosswordPuzzleType): {
  size: number;
  blacks: boolean[][];
  placedLetters: Map<string, string>;
} {
  const size = puzzle.tiles.length;
  const blacks: boolean[][] = [];
  const placedLetters = new Map<string, string>();
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const t = puzzle.tiles[r][c];
      row.push(t.value === 'black');
      if (t.value !== 'black' && t.value !== 'empty') {
        placedLetters.set(`${r},${c}`, t.value as string);
      }
    }
    blacks.push(row);
  }
  return { size, blacks, placedLetters };
}

// Compute wave from puzzle via propagateConstraints
function computeWaveFromPuzzle(
  puzzle: CrosswordPuzzleType,
  baseWave: WaveType,
  bannedWords: string[] = []
): WaveType {
  const { size, blacks, placedLetters } = extractPuzzleState(puzzle);
  const wordsByLength = workerWordIndex
    ? indexToWordsByLength(workerWordIndex)
    : new Map<number, string[]>();
  const filtered = filterBannedWords(wordsByLength, bannedWords);
  const result = propagateConstraints({
    size,
    blacks,
    wordsByLength: filtered,
    placedLetters,
    alphabet: workerAlphabet,
  });

  const elements: ElementType[][] = [];
  for (let r = 0; r < size; r++) {
    const row: ElementType[] = [];
    for (let c = 0; c < size; c++) {
      const solid = blacks[r][c];
      const options = solid ? [] : (result.options[r][c] as LetterType[]);
      row.push({
        row: r,
        column: c,
        options,
        entropy: options.length <= 1 ? 0 : Math.log(options.length),
        solid,
      });
    }
    elements.push(row);
  }
  return { elements, puzzleVersion: puzzle.version };
}

function masksToWave(
  cellMasksLo: Int32Array,
  cellMasksHi: Int32Array,
  blacks: boolean[][],
  alpha: Alphabet = workerAlphabet
): WaveType {
  const size = blacks.length;
  const elements: ElementType[][] = [];
  for (let r = 0; r < size; r++) {
    const row: ElementType[] = [];
    for (let c = 0; c < size; c++) {
      const solid = blacks[r][c];
      const idx = r * size + c;
      const lo = cellMasksLo[idx];
      const options = solid ? [] : (alpha.getLetters(lo) as LetterType[]);
      row.push({
        row: r,
        column: c,
        options,
        entropy: options.length <= 1 ? 0 : Math.log(options.length),
        solid,
      });
    }
    elements.push(row);
  }
  return { elements, puzzleVersion: '' };
}

function recoverTiles(newWave: WaveType, oldWave: WaveType): void {
  _.forEach(newWave.elements, (row, rowIndex) =>
    _.forEach(row, (newElement, columnIndex) => {
      const oldElement = oldWave.elements[rowIndex][columnIndex];
      if (newElement.options.length === 0 && oldElement.options.length <= 1) {
        newElement.options = oldElement.options;
      }
    })
  );
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface WFCWorkerAPIType {
  waitForIndex: () => Promise<void>;
  resetIndex: () => Promise<void>;
  setAlphabet: (letters: string[]) => void;
  withTileUpdates: (
    wave: WaveType,
    puzzle: CrosswordPuzzleType,
    tileUpdates: TileUpdateType[],
    bannedWords?: string[]
  ) => Promise<WaveType>;
  addWordsToIndex: (words: string[]) => void;
  removeWordsFromIndex: (words: string[]) => void;
  startFill: (
    blacks: boolean[][],
    placedLetters: Array<{ row: number; col: number; letter: string }>,
    bankWordsIn: string[],
    seed: number,
    onProgress: (update: FillWaveUpdate) => void
  ) => Promise<void>;
  stopFill: () => void;
  startRevision: (
    blacks: boolean[][],
    solvedGrid: string[][],
    removedSlotCells: Array<Array<{ row: number; col: number }>>,
    lockedSlotCells: Array<Array<{ row: number; col: number }>>,
    bannedWords: string[],
    bankWordsIn: string[],
    seed: number,
    onProgress: (update: FillWaveUpdate) => void
  ) => Promise<void>;
}

const WFCWorkerAPI: WFCWorkerAPIType = {
  waitForIndex: async () => {
    await indexReady;
  },

  resetIndex: async () => {
    if (!workerWordIndex) await indexReady;
    workerWordIndex = buildWordIndex(baseWordList, workerAlphabet);
    bankWords.clear();
  },

  setAlphabet: (letters: string[]) => {
    workerAlphabet = new Alphabet(letters);
    if (baseWordList.length > 0) {
      workerWordIndex = buildWordIndex(baseWordList, workerAlphabet);
    }
  },

  withTileUpdates: async (
    wave: WaveType,
    puzzle: CrosswordPuzzleType,
    tileUpdates: TileUpdateType[],
    bannedWordsIn: string[] = []
  ): Promise<WaveType> => {
    if (!workerWordIndex) await indexReady;
    const puzzleCopy: CrosswordPuzzleType = JSON.parse(JSON.stringify(puzzle));
    _.forEach(tileUpdates, ({ row, column, value }) => {
      puzzleCopy.tiles[row][column].value = value;
    });
    const updated = computeWaveFromPuzzle(puzzleCopy, wave, bannedWordsIn);
    updated.puzzleVersion = puzzle.version;
    recoverTiles(updated, wave);
    return updated;
  },

  addWordsToIndex: (words: string[]) => {
    if (!workerWordIndex) return;
    for (const w of words) bankWords.add(w);
    addWordsToWordIndex(workerWordIndex, words, workerAlphabet);
  },

  removeWordsFromIndex: (words: string[]) => {
    if (!workerWordIndex) return;
    const affectedLens = new Set<number>();
    for (const w of words) {
      if (!bankWords.has(w)) continue;
      bankWords.delete(w);
      const len = w.length;
      const ws = workerWordIndex.words[len];
      if (!ws) continue;
      const idx = ws.indexOf(w);
      if (idx !== -1) {
        ws.splice(idx, 1);
        affectedLens.add(len);
      }
    }
    affectedLens.forEach(len => rebuildBitsetForLength(workerWordIndex!, len));
  },

  startFill: async (
    blacks: boolean[][],
    placedLetters: Array<{ row: number; col: number; letter: string }>,
    bankWordsIn: string[],
    seed: number,
    onProgress: (update: FillWaveUpdate) => void
  ): Promise<void> => {
    if (!workerWordIndex) await indexReady;
    stopFillRequested = false;
    const size = blacks.length;
    const wordsByLength = workerWordIndex
      ? indexToWordsByLength(workerWordIndex)
      : new Map<number, string[]>();

    const engine: FillEngineInstance = createFillEngine({
      size,
      blacks,
      wordsByLength,
      bankWords: bankWordsIn,
      seed,
      timeoutMs: Infinity,
      alphabet: workerAlphabet,
    });

    const placedMap = new Map<string, string>();
    for (const { row, col, letter } of placedLetters) {
      placedMap.set(`${row},${col}`, letter);
    }
    const setOk = engine.setPlacedLetters(placedMap);
    if (!setOk) {
      onProgress({ done: true, success: false, failureReason: 'contradiction' });
      return;
    }

    // Send initial wave (constraint-propagated state) before stepping
    {
      const upd = engine.getProgressUpdate();
      const wave = masksToWave(upd.cellMasksLo, upd.cellMasksHi, blacks, workerAlphabet);
      onProgress({ done: false, wave });
    }

    while (true) {
      if (stopFillRequested) {
        onProgress({ done: true, success: false, failureReason: 'noValidFill' });
        return;
      }
      const done = engine.step(10);
      const upd = engine.getProgressUpdate();
      const wave = masksToWave(upd.cellMasksLo, upd.cellMasksHi, blacks, workerAlphabet);
      if (done) {
        const result = engine.getResult();
        if (result.success) {
          onProgress({ done: true, success: true, grid: result.grid });
        } else {
          onProgress({
            done: true,
            success: false,
            failureReason: (result.failureReason ?? 'noValidFill') as
              'timeout' | 'maxSteps' | 'noValidFill' | 'contradiction',
          });
        }
        return;
      }
      onProgress({ done: false, wave });
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  },

  stopFill: () => {
    stopFillRequested = true;
  },

  startRevision: async (
    _blacks,
    _solvedGrid,
    _removedSlotCells,
    _lockedSlotCells,
    _bannedWords,
    _bankWordsIn,
    _seed,
    onProgress
  ) => {
    onProgress({ done: true, success: false, failureReason: 'noValidFill' });
  },
};

expose(WFCWorkerAPI);

export default {} as typeof Worker & { new (): Worker };
