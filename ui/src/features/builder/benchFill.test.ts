/**
 * Fill engine regression benchmark.
 *
 * Fast grids: 28 grids × 3 seeds at 1s timeout = up to 84 runs.
 * Hard grids: 4 grids × 3 seeds at 20s timeout = up to 12 runs.
 *
 * Outcomes: Y=success, T=timeout, M=maxSteps, N=no-valid-fill (unexpected = bug)
 *
 * PR3 baseline (unoptimized string-based engine):
 *   Fast: 5/84 Y, p50=455ms p90=699ms
 *   Hard: 3/12 Y, p50=6470ms
 * Baselines tighten significantly after PR7/PR8 optimizations.
 */

import * as fs from 'fs';
import * as path from 'path';
import _ from 'lodash';
import { fillGrid, groupWordsByLength } from './fillEngine';

// ---------------------------------------------------------------------------
// Baselines (update after engine changes)
// ---------------------------------------------------------------------------
const Y_BASELINE = 5;
const HARD_FAIL_THRESHOLD = 3;
const HARD_Y_BASELINE = 3;
const HARD_FAIL_THRESHOLD_HARD = 1;

const KNOWN_UNSOLVABLE = new Set<number>();

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const TIMEOUT_MS = 1000;
const HARD_TIMEOUT_MS = 20000;
const MAX_STEPS = 400000;
const SEEDS_PER_GRID = 3;

const GRID_INDICES = [
  173, 250, 269, 288, 442, 500, 577, 615, 654, 673, 712, 731, 866,
  904, 943, 1000, 1039, 1077, 1135, 1173, 1193, 1212, 1270,
  1289, 1327, 1385, 1481, 1520,
];
const HARD_GRID_INDICES = [808, 923, 1154, 1347];

describe('fill engine regression benchmark', () => {
  jest.setTimeout(600000); // 10 minutes

  let wordsByLength: Map<number, string[]>;
  let gridList: { grid: string[] }[];
  let bankWords: string[];

  beforeAll(() => {
    const publicDir = path.join(__dirname, '../../../public');
    const wordList: string[] = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'word_list.json'), 'utf8')
    );
    gridList = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'grid_list.json'), 'utf8')
    );
    wordsByLength = groupWordsByLength(wordList);

    // Sample a small bank-word set from the dictionary
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

  it(`${GRID_INDICES.length} grids × ${SEEDS_PER_GRID} seeds at ${TIMEOUT_MS}ms: Y >= ${HARD_FAIL_THRESHOLD} (baseline ${Y_BASELINE})`, () => {
    const size = 15;
    let successes = 0;
    const total = GRID_INDICES.length * SEEDS_PER_GRID;
    const unexpectedN: string[] = [];

    interface RunStats { outcome: string; steps: number; backtracks: number; elapsedMs: number; }
    const gridResults: Array<{ idx: number; runs: RunStats[] }> = [];

    for (const gridIdx of GRID_INDICES) {
      const g = gridList[gridIdx];
      const blacks = _.times(size, r => _.times(size, c => g.grid[r * size + c] === '.'));
      const seeds = _.times(SEEDS_PER_GRID, i => gridIdx * (i + 1));
      const runs: RunStats[] = [];

      for (const seed of seeds) {
        const t0 = performance.now();
        const r = fillGrid({ size, blacks, wordsByLength, bankWords, seed, timeoutMs: TIMEOUT_MS, maxSteps: MAX_STEPS });
        const elapsedMs = performance.now() - t0;
        let outcome: string;
        if (r.success) { successes++; outcome = 'Y'; }
        else if (r.timedOut) outcome = 'T';
        else if (r.steps >= MAX_STEPS) outcome = 'M';
        else {
          outcome = 'N';
          if (!KNOWN_UNSOLVABLE.has(gridIdx))
            unexpectedN.push(`#${gridIdx} seed=${seed}`);
        }
        runs.push({ outcome, steps: r.steps, backtracks: r.backtracks, elapsedMs });
      }
      gridResults.push({ idx: gridIdx, runs });
    }

    const summaryRow = gridResults.map(({ idx, runs }) =>
      `#${idx}:${runs.map(r => r.outcome).join('')}`
    );
    console.log(`Benchmark results (${successes}/${total}):`);
    console.log(summaryRow.join('  '));

    const successMs = gridResults
      .flatMap(({ runs }) => runs.filter(r => r.outcome === 'Y').map(r => r.elapsedMs))
      .sort((a, b) => a - b);
    const p50 = successMs.length > 0 ? successMs[Math.floor(successMs.length * 0.5)] : 0;
    const p90 = successMs.length > 0 ? successMs[Math.floor(successMs.length * 0.9)] : 0;
    console.log(`Results: ${successes}/${total} Y  p50=${p50.toFixed(0)}ms p90=${p90.toFixed(0)}ms max=${successMs.length > 0 ? successMs[successMs.length - 1].toFixed(0) : 'n/a'}ms`);

    if (unexpectedN.length > 0)
      console.error(`UNEXPECTED N (correctness bug): ${unexpectedN.join(', ')}`);
    if (successes < Y_BASELINE)
      console.warn(`⚠️  REGRESSION: ${successes} Y < baseline ${Y_BASELINE}${successes < HARD_FAIL_THRESHOLD ? ' — HARD FAIL' : ''}`);

    expect(unexpectedN).toHaveLength(0);
    expect(successes).toBeGreaterThanOrEqual(HARD_FAIL_THRESHOLD);
  });

  it(`hard grids: ${HARD_GRID_INDICES.length} grids × ${SEEDS_PER_GRID} seeds at ${HARD_TIMEOUT_MS / 1000}s: Y >= ${HARD_FAIL_THRESHOLD_HARD} (baseline ${HARD_Y_BASELINE})`, () => {
    const size = 15;
    let successes = 0;
    const total = HARD_GRID_INDICES.length * SEEDS_PER_GRID;
    const unexpectedN: string[] = [];

    interface RunStats { outcome: string; steps: number; elapsedMs: number; }
    const gridResults: Array<{ idx: number; runs: RunStats[] }> = [];

    for (const gridIdx of HARD_GRID_INDICES) {
      const g = gridList[gridIdx];
      const blacks = _.times(size, r => _.times(size, c => g.grid[r * size + c] === '.'));
      const seeds = _.times(SEEDS_PER_GRID, i => gridIdx * (i + 1));
      const runs: RunStats[] = [];

      for (const seed of seeds) {
        const t0 = performance.now();
        const r = fillGrid({ size, blacks, wordsByLength, bankWords, seed, timeoutMs: HARD_TIMEOUT_MS, maxSteps: MAX_STEPS });
        const elapsedMs = performance.now() - t0;
        let outcome: string;
        if (r.success) { successes++; outcome = 'Y'; }
        else if (r.timedOut) outcome = 'T';
        else if (r.steps >= MAX_STEPS) outcome = 'M';
        else {
          outcome = 'N';
          if (!KNOWN_UNSOLVABLE.has(gridIdx))
            unexpectedN.push(`#${gridIdx} seed=${seed}`);
        }
        runs.push({ outcome, steps: r.steps, elapsedMs });
      }
      gridResults.push({ idx: gridIdx, runs });
    }

    const summaryRow = gridResults.map(({ idx, runs }) =>
      `#${idx}:${runs.map(r => r.outcome).join('')}`
    );
    console.log(`Hard grids (${successes}/${total}):`);
    console.log(summaryRow.join('  '));

    const successMs = gridResults
      .flatMap(({ runs }) => runs.filter(r => r.outcome === 'Y').map(r => r.elapsedMs))
      .sort((a, b) => a - b);
    if (successMs.length > 0) {
      const p50 = successMs[Math.floor(successMs.length * 0.5)];
      console.log(`Hard success times: p50=${p50.toFixed(0)}ms max=${successMs[successMs.length - 1].toFixed(0)}ms`);
    }

    if (unexpectedN.length > 0)
      console.error(`UNEXPECTED N (correctness bug): ${unexpectedN.join(', ')}`);
    if (successes < HARD_Y_BASELINE)
      console.warn(`⚠️  HARD GRID REGRESSION: ${successes} Y < baseline ${HARD_Y_BASELINE}${successes < HARD_FAIL_THRESHOLD_HARD ? ' — HARD FAIL' : ''}`);

    expect(unexpectedN).toHaveLength(0);
    expect(successes).toBeGreaterThanOrEqual(HARD_FAIL_THRESHOLD_HARD);
  });
});
