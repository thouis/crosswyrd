import type { CrosswordPuzzleType } from './builderSlice';
import type { TileUpdateType, WaveType } from './useWaveFunctionCollapse';

// Returns a copy of `wave` where, for each updated letter tile, the tile
// itself and every still-empty tile in the slots (across and down) running
// through it are marked unfillable (options = []). Used when a tile update
// produces a contradiction: the half-propagated masks from the engine are
// meaningless, so we keep the last consistent wave, flag the offending cell,
// and blank the stale letter hints in its slots (rendered red). Tiles that
// already hold letters elsewhere in those slots are left untouched so valid
// crossing words don't turn red.
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

  for (const { row, column, value } of tileUpdates) {
    if (value === 'black' || value === 'empty') continue;
    mark(row, column);
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
  }
  return result;
}
