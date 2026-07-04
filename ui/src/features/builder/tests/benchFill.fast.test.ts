/**
 * Fill engine fast regression benchmark.
 * 28 grids × 3 seeds at 2s timeout = up to 84 runs.
 *
 * Outcomes: Y=success, T=timeout, M=maxSteps, N=no-valid-fill (unexpected = bug)
 *
 * Baselines (2s timeout):
 *   PR6b: 5/84 Y
 *   PR7:  15/84 Y
 */

import * as fs from 'fs';
import * as path from 'path';
import _ from 'lodash';
import { fillGrid } from '../fillEngine';
import { groupWordsByLength } from '../wordIndex';

const KNOWN_UNSOLVABLE = new Set<number>();

const TIMEOUT_MS = 2000;
const MAX_STEPS = 400000;
const SEEDS_PER_GRID = 3;

const GRID_INDICES = [
  173, 250, 269, 288, 442, 500, 577, 615, 654, 673, 712, 731, 866,
  904, 943, 1000, 1039, 1077, 1135, 1173, 1193, 1212, 1270,
  1289, 1327, 1385, 1481, 1520,
];

describe('fill engine fast benchmark', () => {
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

  it(`${GRID_INDICES.length} grids × ${SEEDS_PER_GRID} seeds at ${TIMEOUT_MS}ms`, () => {
    const size = 15;
    let successes = 0;
    const total = GRID_INDICES.length * SEEDS_PER_GRID;
    const unexpectedN: string[] = [];
    const allSuccessMs: number[] = [];

    for (const gridIdx of GRID_INDICES) {
      const g = gridList[gridIdx];
      const blacks = _.times(size, r => _.times(size, c => g.grid[r * size + c] === '.'));
      const seeds = _.times(SEEDS_PER_GRID, i => gridIdx * (i + 1));

      const outcomes: string[] = [];
      const times: number[] = [];

      for (const seed of seeds) {
        const t0 = performance.now();
        const r = fillGrid({ size, blacks, wordsByLength, bankWords, seed, timeoutMs: TIMEOUT_MS, maxSteps: MAX_STEPS });
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
    const p50 = allSuccessMs.length > 0 ? allSuccessMs[Math.floor(allSuccessMs.length * 0.5)] : 0;
    const p90 = allSuccessMs.length > 0 ? allSuccessMs[Math.floor(allSuccessMs.length * 0.9)] : 0;
    const maxMs = allSuccessMs.length > 0 ? allSuccessMs[allSuccessMs.length - 1].toFixed(0) : 'n/a';

    console.log(`\n  RESULT: ${successes}/${total} Y`);
    console.log(`  p50=${p50.toFixed(0)}ms  p90=${p90.toFixed(0)}ms  max=${maxMs}ms`);
    console.log(`  baseline PR6b: 5/84 Y`);
    console.log(`  baseline PR7:  15/84 Y\n`);

    if (unexpectedN.length > 0)
      console.error(`UNEXPECTED N (correctness bug): ${unexpectedN.join(', ')}`);

    expect(unexpectedN).toHaveLength(0);
  });
});
