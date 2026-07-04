/**
 * Integration test: load test_ban.puz, ban MORRO, run revision fill,
 * verify that MORRO is gone and fewer than 10 words changed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PuzCrossword } from '@confuzzle/puz-crossword';
import { runRevisionFill, buildSlotTopology } from '../fillEngine';
import { groupWordsByLength } from '../wordIndex';

jest.setTimeout(60000);

function parsePuz(filePath: string): {
  size: number;
  blacks: boolean[][];
  solvedGrid: string[][];
} {
  const buf = fs.readFileSync(filePath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const data = PuzCrossword.from(ab);
  const { width: size, height, solution } = data;
  if (size !== height) throw new Error(`Non-square puzzle: ${size}x${height}`);

  const blacks: boolean[][] = [];
  const solvedGrid: string[][] = [];
  for (let r = 0; r < size; r++) {
    const blackRow: boolean[] = [];
    const solRow: string[] = [];
    for (let c = 0; c < size; c++) {
      const ch = solution[r * size + c];
      if (ch === '.') {
        blackRow.push(true);
        solRow.push('');
      } else {
        blackRow.push(false);
        solRow.push(ch.toLowerCase());
      }
    }
    blacks.push(blackRow);
    solvedGrid.push(solRow);
  }
  return { size, blacks, solvedGrid };
}

function getSlotWords(
  grid: string[][],
  blacks: boolean[][]
): Map<string, string> {
  const size = blacks.length;
  const { slots } = buildSlotTopology(size, blacks);
  const result = new Map<string, string>();
  for (const slot of slots) {
    const word = slot.cells.map(({ row, col }) => grid[row][col]).join('');
    result.set(`${slot.id}`, word);
  }
  return result;
}

function extractPuzzleWords(grid: string[][], blacks: boolean[][]): string[] {
  return Array.from(getSlotWords(grid, blacks).values()).filter(w => w.length >= 2);
}

describe('ban MORRO and refill', () => {
  let wordsByLength: Map<number, string[]>;
  let blacks: boolean[][];
  let solvedGrid: string[][];
  let size: number;

  beforeAll(() => {
    const publicDir = path.join(__dirname, '../../../../public');
    const wordList: string[] = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'word_list.json'), 'utf8')
    );
    wordsByLength = groupWordsByLength(wordList);

    const puzPath = path.join(__dirname, 'test_ban.puz');
    ({ size, blacks, solvedGrid } = parsePuz(puzPath));
  });

  it('puzzle parses as 17x17 with MORRO in it', () => {
    expect(size).toBe(17);
    // MORRO is row 0, cols 11-15
    expect(['m','o','r','r','o'].every((ch, i) => solvedGrid[0][11 + i] === ch)).toBe(true);
  });

  it('revision fill removes MORRO and changes fewer than 10 words', () => {
    const { slots } = buildSlotTopology(size, blacks);

    // Find the MORRO slot (across at row 0, starting col 11, length 5)
    const morroSlot = slots.find(
      s => s.direction === 'across' &&
           s.cells.length === 5 &&
           s.cells[0].row === 0 &&
           s.cells[0].col === 11
    );
    expect(morroSlot).toBeDefined();

    const removedSlotCells = [morroSlot!.cells.map(({ row, col }) => ({ row, col }))];

    const originalWords = getSlotWords(solvedGrid, blacks);
    // Pass all puzzle words (minus morro) as bank words so proper nouns are preserved
    const puzzleWords = extractPuzzleWords(solvedGrid, blacks).filter(w => w !== 'morro');

    const result = runRevisionFill({
      solvedGrid,
      blacks,
      wordsByLength,
      bannedWords: ['morro'],
      removedSlotCells,
      bankWords: puzzleWords,
      seed: 42,
      timeoutMs: 30000,
    });

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);

    const newGrid = result!.grid;
    const newWords = getSlotWords(newGrid, blacks);

    // MORRO must not appear anywhere
    for (const [, word] of newWords) {
      expect(word.toLowerCase()).not.toBe('morro');
    }

    // Count changed words
    let changedCount = 0;
    for (const [id, origWord] of originalWords) {
      if (newWords.get(id) !== origWord) changedCount++;
    }
    console.log(`Words changed: ${changedCount} / ${originalWords.size}`);
    expect(changedCount).toBeLessThan(10);
  });

  it('ban MORRO + lock RESPECT: <10 words change and RESPECT preserved across 5 seeds', () => {
    const { slots } = buildSlotTopology(size, blacks);

    // MORRO: across, row 0, cols 11-15
    const morroSlot = slots.find(
      s => s.direction === 'across' &&
           s.cells.length === 5 &&
           s.cells[0].row === 0 &&
           s.cells[0].col === 11
    );
    expect(morroSlot).toBeDefined();

    // RESPECT: down, row 0, col 14 (crosses MORRO)
    const respectSlot = slots.find(s => {
      const word = s.cells.map(({ row, col }) => solvedGrid[row][col]).join('');
      return word === 'respect';
    });
    expect(respectSlot).toBeDefined();

    const removedSlotCells = [morroSlot!.cells.map(({ row, col }) => ({ row, col }))];
    const lockedSlotCells = [respectSlot!.cells.map(({ row, col }) => ({ row, col }))];
    const originalWords = getSlotWords(solvedGrid, blacks);
    const puzzleWords = extractPuzzleWords(solvedGrid, blacks).filter(w => w !== 'morro');
    const respectKey = `${respectSlot!.id}`;

    for (let seed = 1; seed <= 5; seed++) {
      const result = runRevisionFill({
        solvedGrid,
        blacks,
        wordsByLength,
        bannedWords: ['morro'],
        removedSlotCells,
        lockedSlotCells,
        bankWords: puzzleWords,
        seed,
        timeoutMs: 30000,
      });

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);

      const newGrid = result!.grid;
      const newWords = getSlotWords(newGrid, blacks);

      for (const [, word] of newWords) {
        expect(word.toLowerCase()).not.toBe('morro');
      }

      expect(newWords.get(respectKey)).toBe('respect');

      let changedCount = 0;
      for (const [id, origWord] of originalWords) {
        if (newWords.get(id) !== origWord) changedCount++;
      }
      console.log(`Seed ${seed}: Words changed: ${changedCount} / ${originalWords.size}`);
      expect(changedCount).toBeLessThan(10);
    }
  });
});
