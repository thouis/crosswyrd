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

  it('black update: marks the cell solid/empty-options and blanks empty cells in adjacent runs', () => {
    // 3x3, all empty. Toggle (1,1) to black.
    const puzzle = makePuzzle(['   ', ' . ', '   ']);
    const wave = makeWave(3);
    const result = waveWithUnfillableUpdates(
      wave,
      [{ row: 1, column: 1, value: 'black' }],
      puzzle,
      'v2'
    );
    // the newly-black cell itself: solid + options emptied
    expect(result.elements[1][1].solid).toBe(true);
    expect(result.elements[1][1].options).toEqual([]);
    expect(result.elements[1][1].entropy).toBe(0);
    // across run through (1,1): (1,0) and (1,2) are empty -> blanked
    expect(result.elements[1][0].options).toEqual([]);
    expect(result.elements[1][2].options).toEqual([]);
    // down run through (1,1): (0,1) and (2,1) are empty -> blanked
    expect(result.elements[0][1].options).toEqual([]);
    expect(result.elements[2][1].options).toEqual([]);
    // corners untouched
    expect(result.elements[0][0].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[0][2].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[2][0].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[2][2].options).toEqual(['a', 'b', 'c']);
  });

  it('black update: lettered cells in the adjacent runs are left untouched', () => {
    const puzzle = makePuzzle([
      'a  ', //
      ' . ', //
      '  b',
    ]);
    const wave = makeWave(3);
    const result = waveWithUnfillableUpdates(
      wave,
      [{ row: 1, column: 1, value: 'black' }],
      puzzle,
      'v'
    );
    // (0,1) and (1,0) are empty in their runs through (1,1) -> blanked
    expect(result.elements[0][1].options).toEqual([]);
    expect(result.elements[1][0].options).toEqual([]);
    // 'a' at (0,0) and 'b' at (2,2) are not in either run through (1,1)
    expect(result.elements[0][0].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[2][2].options).toEqual(['a', 'b', 'c']);
  });

  it('empty update (deletion): does not mark the deleted cell directly, but blanks empty slot-mates', () => {
    // 3x3, all empty, no black squares -> full-width/height slots. Delete (0,1).
    const puzzle = makePuzzle(['   ', '   ', '   ']);
    const wave = makeWave(3);
    const result = waveWithUnfillableUpdates(
      wave,
      [{ row: 0, column: 1, value: 'empty' }],
      puzzle,
      'v'
    );
    // across run through (0,1): (0,0) and (0,2) are empty -> blanked
    expect(result.elements[0][0].options).toEqual([]);
    expect(result.elements[0][2].options).toEqual([]);
    // down run through (0,1): (1,1) and (2,1) are empty -> blanked
    expect(result.elements[1][1].options).toEqual([]);
    expect(result.elements[2][1].options).toEqual([]);
    // cells outside those runs untouched
    expect(result.elements[1][0].options).toEqual(['a', 'b', 'c']);
    expect(result.elements[2][2].options).toEqual(['a', 'b', 'c']);
  });

  it('mixed batch: black and letter updates behave per-update', () => {
    const puzzle = makePuzzle([
      'x  ', //
      ' . ', //
      '   ',
    ]);
    const wave = makeWave(3);
    const result = waveWithUnfillableUpdates(
      wave,
      [
        { row: 0, column: 0, value: 'x' },
        { row: 1, column: 1, value: 'black' },
      ],
      puzzle,
      'v'
    );
    // letter update: typed cell marked red
    expect(result.elements[0][0].options).toEqual([]);
    // black update: cell marked solid + options emptied
    expect(result.elements[1][1].solid).toBe(true);
    expect(result.elements[1][1].options).toEqual([]);
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
