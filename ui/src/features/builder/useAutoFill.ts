import { proxy, Remote } from 'comlink';
import _ from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import { randomId } from '../../app/util';
import {
  CrosswordPuzzleType,
  LetterType,
  setPuzzleState,
  setWaveState,
} from './builderSlice';
import { withPuzzleTileUpdates } from './useTileInput';
import { WaveAndPuzzleType } from './useWaveAndPuzzleHistory';
import {
  FillWaveUpdate,
  TileUpdateType,
  WaveType,
} from './useWaveFunctionCollapse';
import type { DictionaryType } from './useDictionary';
import type { WFCWorkerAPIType } from './WFCWorker.worker';

interface ReturnType {
  runAutoFill: () => void;
  stopAutoFill: () => void;
  autoFillError: string | null;
}

export default function useAutoFill(
  puzzle: CrosswordPuzzleType,
  autoFillRunning: boolean,
  setAutoFillRunning: (running: boolean) => void,
  pushStateHistory: (waveAndPuzzle: WaveAndPuzzleType) => void,
  WFCWorkerRef: React.MutableRefObject<Remote<WFCWorkerAPIType> | null>,
  updateWaveWithTileUpdates: (
    dictionary: DictionaryType,
    tileUpdates: TileUpdateType[],
    newPuzzleVersion?: string
  ) => Promise<WaveType | null>,
  wordBankWords: string[] = []
): ReturnType {
  const [autoFillErrorState, setAutoFillErrorState] = useState<{
    error: string;
    puzzleVersion: string;
  } | null>(null);
  const fillIdRef = useRef(0);
  const dispatch = useDispatch();

  useEffect(() => {
    if (
      autoFillErrorState &&
      (autoFillRunning || puzzle.version !== autoFillErrorState.puzzleVersion)
    ) {
      setAutoFillErrorState(null);
    }
  }, [autoFillErrorState, autoFillRunning, puzzle.version]);

  const runAutoFill = useCallback(() => {
    if (!WFCWorkerRef.current) return;
    if (autoFillRunning) return;
    fillIdRef.current += 1;
    const thisFillId = fillIdRef.current;
    setAutoFillRunning(true);

    const size = puzzle.tiles.length;
    const blacks: boolean[][] = [];
    const placedLetters: Array<{ row: number; col: number; letter: string }> = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) {
        const t = puzzle.tiles[r][c];
        row.push(t.value === 'black');
        if (t.value !== 'black' && t.value !== 'empty') {
          placedLetters.push({ row: r, col: c, letter: t.value as string });
        }
      }
      blacks.push(row);
    }

    const seed = Math.floor(Math.random() * 0x7fffffff);
    const puzzleAtStart = puzzle;

    const onProgress = (update: FillWaveUpdate) => {
      // Stale check
      if (thisFillId !== fillIdRef.current) return;

      if (!update.done) {
        dispatch(setWaveState(update.wave));
        return;
      }
      if (update.success) {
        const grid = update.grid;
        const tileUpdates: TileUpdateType[] = [];
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) {
            const cur = puzzleAtStart.tiles[r][c].value;
            const gv = grid[r][c];
            if (gv === '.' || gv === ' ') continue;
            if (cur !== gv) {
              tileUpdates.push({ row: r, column: c, value: gv as LetterType });
            }
          }
        }
        const newVersion = randomId();
        updateWaveWithTileUpdates(
          null as unknown as DictionaryType,
          tileUpdates,
          newVersion
        ).then((newWave) => {
          if (thisFillId !== fillIdRef.current) return;
          if (newWave) {
            const newPuzzle = withPuzzleTileUpdates(
              puzzleAtStart,
              tileUpdates,
              newVersion
            );
            pushStateHistory({ wave: newWave, puzzle: newPuzzle });
            dispatch(setPuzzleState(newPuzzle));
          }
          setAutoFillRunning(false);
        });
      } else {
        const reason = update.failureReason;
        const error =
          reason === 'timeout'
            ? 'Auto-Fill timed out before finding a solution. Try undoing recent changes or erasing placed words.'
            : reason === 'maxSteps'
            ? 'Auto-Fill reached the maximum step limit. Try undoing recent changes or erasing placed words.'
            : 'Auto-Fill cannot fill the puzzle from here! Try undoing recent changes or erasing words you have already placed.';
        setAutoFillRunning(false);
        setAutoFillErrorState({ error, puzzleVersion: puzzle.version });
      }
    };

    WFCWorkerRef.current
      .startFill(blacks, placedLetters, wordBankWords, seed, proxy(onProgress))
      .catch(() => {
        if (thisFillId !== fillIdRef.current) return;
        setAutoFillRunning(false);
      });
  }, [
    WFCWorkerRef,
    autoFillRunning,
    puzzle,
    wordBankWords,
    updateWaveWithTileUpdates,
    pushStateHistory,
    dispatch,
    setAutoFillRunning,
  ]);

  const stopAutoFill = useCallback(() => {
    fillIdRef.current += 1;
    if (WFCWorkerRef.current) WFCWorkerRef.current.stopFill();
    setAutoFillRunning(false);
  }, [WFCWorkerRef, setAutoFillRunning]);

  const autoFillError = useMemo(
    () => autoFillErrorState?.error || null,
    [autoFillErrorState]
  );

  return { runAutoFill, stopAutoFill, autoFillError };
}
