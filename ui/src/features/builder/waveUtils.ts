import type { CrosswordPuzzleType } from './builderSlice';
import type { TileUpdateType, WaveType } from './useWaveFunctionCollapse';

// Returns a copy of `wave` where, for each updated tile, the still-empty
// tiles in the slots (across and down) running through it are marked
// unfillable (options = []). Used when a tile update produces a
// contradiction: the half-propagated masks from the engine are meaningless,
// so we keep the last consistent wave and blank the stale letter hints in
// the affected slots (rendered red). Tiles that already hold letters
// elsewhere in those slots are left untouched so valid crossing words don't
// turn red. Three cases, per update value:
//   - letter: mark the typed cell itself plus empty cells in its slots.
//   - black: sync the wave to the new topology (solid = true, options = [])
//     and mark empty cells in the slots that ran through the cell before it
//     went black (walked from each of its four neighbors), so the user sees
//     a visible red indication of the affected slots.
//   - empty (deletion): don't mark the deleted cell itself, but a deletion
//     inside a contradiction batch means hints in its slots are stale too,
//     so blank the still-empty cells in its slots.
//
// `puzzle` must already reflect the tile updates.
export function waveWithUnfillableUpdates(
  wave: WaveType,
  tileUpdates: TileUpdateType[],
  puzzle: CrosswordPuzzleType,
  puzzleVersion: string
): WaveType {
  const result: WaveType = {
    elements: wave.elements.map((row) => row.map((el) => ({ ...el }))),
    puzzleVersion,
  };
  const size = puzzle.tiles.length;
  const isBlack = (r: number, c: number) =>
    r < 0 || r >= size || c < 0 || c >= size || puzzle.tiles[r][c].value === 'black';
  const mark = (r: number, c: number) => {
    const el = result.elements[r][c];
    el.options = [];
    el.entropy = 0;
  };
  const markEmptySlotsThrough = (row: number, column: number) => {
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      for (const dir of [1, -1]) {
        let r = row + dr * dir;
        let c = column + dc * dir;
        while (!isBlack(r, c)) {
          if (puzzle.tiles[r][c].value === 'empty') mark(r, c);
          r += dr * dir;
          c += dc * dir;
        }
      }
    }
  };

  for (const { row, column, value } of tileUpdates) {
    if (value === 'black') {
      const el = result.elements[row][column];
      el.solid = true;
      el.options = [];
      el.entropy = 0;
      markEmptySlotsThrough(row, column);
      continue;
    }
    if (value === 'empty') {
      markEmptySlotsThrough(row, column);
      continue;
    }
    mark(row, column);
    markEmptySlotsThrough(row, column);
  }
  return result;
}
