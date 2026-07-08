import type { WaveType } from '../useWaveFunctionCollapse';
import { waveWithUnfillableUpdates } from '../waveUtils';

function makeWave(size: number): WaveType {
  return {
    elements: Array.from({ length: size }, (_u, r) =>
      Array.from({ length: size }, (_u2, c) => ({
        row: r,
        column: c,
        options: ['a', 'b', 'c'],
        entropy: Math.log(3),
        solid: false,
      }))
    ),
    puzzleVersion: 'old-version',
  };
}

describe('waveWithUnfillableUpdates', () => {
  it('empties options only on updated letter tiles and stamps the version', () => {
    const wave = makeWave(3);
    const result = waveWithUnfillableUpdates(
      wave,
      [{ row: 0, column: 1, value: 'x' }],
      'new-version'
    );
    expect(result.puzzleVersion).toEqual('new-version');
    expect(result.elements[0][1].options).toEqual([]);
    expect(result.elements[0][1].entropy).toEqual(0);
    // all other cells untouched
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 0 && c === 1) continue;
        expect(result.elements[r][c].options).toEqual(['a', 'b', 'c']);
      }
    }
  });

  it('ignores black and empty tile updates', () => {
    const wave = makeWave(2);
    const result = waveWithUnfillableUpdates(
      wave,
      [
        { row: 0, column: 0, value: 'black' },
        { row: 1, column: 1, value: 'empty' },
      ],
      'v'
    );
    expect(result.elements[0][0].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[1][1].options).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input wave', () => {
    const wave = makeWave(2);
    waveWithUnfillableUpdates(wave, [{ row: 0, column: 0, value: 'z' }], 'v');
    expect(wave.elements[0][0].options).toEqual(['a', 'b', 'c']);
    expect(wave.puzzleVersion).toEqual('old-version');
  });
});
