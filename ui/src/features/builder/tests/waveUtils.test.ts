import type { CrosswordPuzzleType } from '../builderSlice';
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

// rows: strings with '.' = black, ' ' = empty, letter = placed letter
function makePuzzle(rows: string[]): CrosswordPuzzleType {
  return {
    tiles: rows.map((row) =>
      row.split('').map((ch) => ({
        value: ch === '.' ? 'black' : ch === ' ' ? 'empty' : ch,
      }))
    ),
    version: 'v',
  };
}

describe('waveWithUnfillableUpdates', () => {
  it('marks the typed cell and empty cells of both slots through it', () => {
    // 4x4; type 'x' at (1,1). Row 1: black at col 3 bounds the across slot.
    // Col 1 runs the full height.
    const puzzle = makePuzzle([
      '  a ', //
      ' x .', //
      '  b ', //
      '    ',
    ]);
    const wave = makeWave(4);
    const result = waveWithUnfillableUpdates(
      wave,
      [{ row: 1, column: 1, value: 'x' }],
      puzzle,
      'new-version'
    );
    expect(result.puzzleVersion).toEqual('new-version');
    // typed cell red
    expect(result.elements[1][1].options).toEqual([]);
    // across slot (1,0)-(1,2): (1,0) empty → marked; (1,2) empty → marked
    expect(result.elements[1][0].options).toEqual([]);
    expect(result.elements[1][2].options).toEqual([]);
    // down slot col 1 rows 0-3: empties marked
    expect(result.elements[0][1].options).toEqual([]);
    expect(result.elements[2][1].options).toEqual([]);
    expect(result.elements[3][1].options).toEqual([]);
    // cells with placed letters in other slots untouched
    expect(result.elements[0][2].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[2][2].options).toEqual(['a', 'b', 'c']);
    // cells outside both slots untouched
    expect(result.elements[3][0].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[0][0].options).toEqual(['a', 'b', 'c']);
    // black-bounded: (1,3) is black, untouched
    expect(result.elements[1][3].options).toEqual(['a', 'b', 'c']);
  });

  it('leaves placed letters in the same slot untouched', () => {
    // typing 'x' at (0,0); (0,2) already holds a letter → not marked
    const puzzle = makePuzzle([
      'x z ', //
      '....',
      '....',
      '....',
    ]);
    const wave = makeWave(4);
    const result = waveWithUnfillableUpdates(
      wave,
      [{ row: 0, column: 0, value: 'x' }],
      puzzle,
      'v2'
    );
    expect(result.elements[0][0].options).toEqual([]);
    expect(result.elements[0][1].options).toEqual([]); // empty in slot
    expect(result.elements[0][2].options).toEqual(['a', 'b', 'c']); // placed letter
    expect(result.elements[0][3].options).toEqual([]); // empty in slot
  });

  it('ignores black and empty tile updates', () => {
    const puzzle = makePuzzle(['  ', '  ']);
    const wave = makeWave(2);
    const result = waveWithUnfillableUpdates(
      wave,
      [
        { row: 0, column: 0, value: 'black' },
        { row: 1, column: 1, value: 'empty' },
      ],
      puzzle,
      'v'
    );
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 2; c++)
        expect(result.elements[r][c].options).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input wave', () => {
    const puzzle = makePuzzle(['z ', '  ']);
    const wave = makeWave(2);
    waveWithUnfillableUpdates(wave, [{ row: 0, column: 0, value: 'z' }], puzzle, 'v');
    expect(wave.elements[0][0].options).toEqual(['a', 'b', 'c']);
    expect(wave.elements[0][1].options).toEqual(['a', 'b', 'c']);
    expect(wave.puzzleVersion).toEqual('old-version');
  });
});
