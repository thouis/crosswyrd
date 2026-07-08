import type { TileUpdateType, WaveType } from './useWaveFunctionCollapse';

// Returns a copy of `wave` where the letter tiles in `tileUpdates` are marked
// unfillable (options = []). Used when a tile update produces a contradiction:
// the half-propagated masks from the engine are meaningless, so we keep the
// last consistent wave and flag only the offending cells (rendered red).
export function waveWithUnfillableUpdates(
  wave: WaveType,
  tileUpdates: TileUpdateType[],
  puzzleVersion: string
): WaveType {
  const result: WaveType = {
    elements: wave.elements.map((row) => row.map((el) => ({ ...el }))),
    puzzleVersion,
  };
  for (const { row, column, value } of tileUpdates) {
    if (value === 'black' || value === 'empty') continue;
    const el = result.elements[row][column];
    el.options = [];
    el.entropy = 0;
  }
  return result;
}
