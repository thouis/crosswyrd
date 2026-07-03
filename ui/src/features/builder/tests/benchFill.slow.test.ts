/**
 * Fill engine slow regression benchmark.
 * 4 hard grids × 3 seeds at 20s timeout = up to 12 runs.
 *
 * Outcomes: Y=success, T=timeout, M=maxSteps, N=no-valid-fill (unexpected = bug)
 *
 * PR3 baseline: 3/12 Y, p50=6470ms
 */

import * as fs from 'fs';
import * as path from 'path';
import _ from 'lodash';
import { fillGrid } from '../fillEngine';
import { groupWordsByLength } from '../wordIndex';

const HARD_Y_BASELINE = 3;
const HARD_FAIL_THRESHOLD = 1;
const KNOWN_UNSOLVABLE = new Set<number>();

const HARD_TIMEOUT_MS = 20000;
const MAX_STEPS = 400000;
const SEEDS_PER_GRID = 3;

const HARD_GRID_INDICES = [808, 923, 1154, 1347];

describe('fill engine slow benchmark', () => {
  jest.setTimeout(600000);

  let wordsByLength: Map<number, string[]>;
  let gridList: { grid: string[] }[];
  let bankWords: string[];

  beforeAll(() => {
    const publicDir = path.join(__dirname, '../../../../public');
    const wordList: string[] = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'word_list.json'), 'utf8')
    );
    gridList = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'grid_list.json'), 'utf8')
    );
    wordsByLength = groupWordsByLength(wordList);

    const dictObj: { [len: number]: string[] } = {};
    for (const [len, ws] of wordsByLength) dictObj[len] = ws;
    bankWords = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
      .flatMap(len =>
        (dictObj[len] || [])
          .filter((_, i) => i % Math.ceil((dictObj[len]?.length || 1) / 20) === 0)
          .slice(0, 20)
      )
      .slice(0, 164);
  });

  it(`${HARD_GRID_INDICES.length} grids × ${SEEDS_PER_GRID} seeds at ${HARD_TIMEOUT_MS / 1000}s: Y >= ${HARD_FAIL_THRESHOLD} (baseline ${HARD_Y_BASELINE})`, () => {
    const size = 15;
    let successes = 0;
    const total = HARD_GRID_INDICES.length * SEEDS_PER_GRID;
    const unexpectedN: string[] = [];
    const allSuccessMs: number[] = [];

    for (const gridIdx of HARD_GRID_INDICES) {
      const g = gridList[gridIdx];
      const blacks = _.times(size, r => _.times(size, c => g.grid[r * size + c] === '.'));
      const seeds = _.times(SEEDS_PER_GRID, i => gridIdx * (i + 1));

      const outcomes: string[] = [];
      const times: number[] = [];

      for (const seed of seeds) {
        const t0 = performance.now();
        const r = fillGrid({ size, blacks, wordsByLength, bankWords, seed, timeoutMs: HARD_TIMEOUT_MS, maxSteps: MAX_STEPS });
        const elapsedMs = performance.now() - t0;
        times.push(elapsedMs);
        let outcome: string;
        if (r.success) { successes++; outcome = 'Y'; allSuccessMs.push(elapsedMs); }
        else if (r.timedOut) outcome = 'T';
        else if (r.steps >= MAX_STEPS) outcome = 'M';
        else {
          outcome = 'N';
          if (!KNOWN_UNSOLVABLE.has(gridIdx))
            unexpectedN.push(`#${gridIdx} seed=${seed}`);
        }
        outcomes.push(outcome);
      }

      const minMs = Math.min(...times).toFixed(0);
      const maxMs = Math.max(...times).toFixed(0);
      console.log(`#${gridIdx}: ${outcomes.join('')}  ${minMs}-${maxMs}ms`);
    }

    allSuccessMs.sort((a, b) => a - b);
    if (allSuccessMs.length > 0) {
      const p50 = allSuccessMs[Math.floor(allSuccessMs.length * 0.5)];
      console.log(`Total: ${successes}/${total} Y  p50=${p50.toFixed(0)}ms max=${allSuccessMs[allSuccessMs.length - 1].toFixed(0)}ms`);
    } else {
      console.log(`Total: ${successes}/${total} Y`);
    }

    if (unexpectedN.length > 0)
      console.error(`UNEXPECTED N (correctness bug): ${unexpectedN.join(', ')}`);
    if (successes < HARD_Y_BASELINE)
      console.warn(`⚠️  REGRESSION: ${successes} Y < baseline ${HARD_Y_BASELINE}${successes < HARD_FAIL_THRESHOLD ? ' — HARD FAIL' : ''}`);

    expect(unexpectedN).toHaveLength(0);
    expect(successes).toBeGreaterThanOrEqual(HARD_FAIL_THRESHOLD);
  });
});
