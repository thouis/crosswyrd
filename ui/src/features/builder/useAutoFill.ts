import { Remote, proxy } from 'comlink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { randomId } from '../../app/util';
import {
  CrosswordPuzzleType,
  LetterType,
  selectBannedWords,
  selectLockedSlots,
  setPuzzleState,
  setWaveState,
  slotKey,
} from './builderSlice';
import { withPuzzleTileUpdates } from './useTileInput';
import { WaveAndPuzzleType } from './useWaveAndPuzzleHistory';
import {
  FillWaveUpdate,
  TileUpdateType,
  WaveType,
} from './useWaveFunctionCollapse';
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
  pushStateHistory: (wap: WaveAndPuzzleType) => void,
  WFCWorkerRef: React.MutableRefObject<Remote<WFCWorkerAPIType> | null>,
  updateWaveWithTileUpdates: (
    tileUpdates: TileUpdateType[],
    newPuzzleVersion?: string
  ) => Promise<WaveType | null>,
  wordBankWords: string[] = [],
  onUnknownWords?: (words: string[]) => void
): ReturnType {
  const [autoFillErrorState, setAutoFillErrorState] = useState<{
    error: string;
    puzzleVersion: string;
  } | null>(null);

  const fillIdRef = useRef(0);
  const puzzleRef = useRef(puzzle);
  useEffect(() => { puzzleRef.current = puzzle; }, [puzzle]);

  const dispatch = useDispatch();
  const lockedSlots = useSelector(selectLockedSlots);
  const bannedWords = useSelector(selectBannedWords);
  const lockedSlotsRef = useRef(lockedSlots);
  const bannedWordsRef = useRef(bannedWords);
  useEffect(() => { lockedSlotsRef.current = lockedSlots; }, [lockedSlots]);
  useEffect(() => { bannedWordsRef.current = bannedWords; }, [bannedWords]);

  useEffect(() => {
    if (
      autoFillErrorState &&
      (autoFillRunning || puzzle.version !== autoFillErrorState.puzzleVersion)
    )
      setAutoFillErrorState(null);
  }, [autoFillErrorState, autoFillRunning, puzzle.version]);

  const runAutoFill = useCallback(() => {
    if (autoFillRunning) return;
    if (!WFCWorkerRef.current) return;

    fillIdRef.current += 1;
    const currentFillId = fillIdRef.current;
    setAutoFillRunning(true);

    const startPuzzle = puzzleRef.current;
    const size = startPuzzle.tiles.length;
    const blacks: boolean[][] = startPuzzle.tiles.map((row) =>
      row.map((tile) => tile.value === 'black')
    );

    const seed = Math.floor(Math.random() * 0x7fffffff);

    const solid = (r: number, c: number) =>
      !startPuzzle.tiles[r]?.[c] || startPuzzle.tiles[r][c].value === 'black';

    interface SlotInfo {
      key: string;
      cells: Array<{ row: number; col: number }>;
      word: string;
    }
    const allSlots: SlotInfo[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (solid(r, c)) continue;
        if (solid(r, c - 1)) {
          const cells: Array<{ row: number; col: number }> = [];
          for (let cc = c; cc < size && !solid(r, cc); cc++) cells.push({ row: r, col: cc });
          if (cells.length >= 2) {
            const hasEmpty = cells.some(({ row, col }) => startPuzzle.tiles[row][col].value === 'empty');
            const word = hasEmpty ? '' : cells.map(({ row, col }) => startPuzzle.tiles[row][col].value as string).join('');
            allSlots.push({ key: slotKey(r, c, 'across'), cells, word });
          }
        }
        if (solid(r - 1, c)) {
          const cells: Array<{ row: number; col: number }> = [];
          for (let rr = r; rr < size && !solid(rr, c); rr++) cells.push({ row: rr, col: c });
          if (cells.length >= 2) {
            const hasEmpty = cells.some(({ row, col }) => startPuzzle.tiles[row][col].value === 'empty');
            const word = hasEmpty ? '' : cells.map(({ row, col }) => startPuzzle.tiles[row][col].value as string).join('');
            allSlots.push({ key: slotKey(r, c, 'down'), cells, word });
          }
        }
      }
    }

    const currentLockedSlots = lockedSlotsRef.current;
    const currentBannedWords = bannedWordsRef.current;
    const lockedSlotsSet = new Set(currentLockedSlots);
    const bannedWordsSet = new Set(currentBannedWords);

    const bannedSlots = allSlots.filter((s) => s.word && bannedWordsSet.has(s.word));
    const hasLocked = currentLockedSlots.length > 0;
    const hasBanned = bannedSlots.length > 0;

    const onProgress = (update: FillWaveUpdate) => {
      if (currentFillId !== fillIdRef.current) return;
      const curPuzzle = puzzleRef.current;

      if (!update.done) {
        dispatch(
          setWaveState({ ...update.wave, puzzleVersion: curPuzzle.version })
        );
        return;
      }

      setAutoFillRunning(false);
      if (update.success) {
        const tileUpdates: TileUpdateType[] = [];
        const sz = curPuzzle.tiles.length;
        for (let r = 0; r < sz; r++) {
          for (let c = 0; c < sz; c++) {
            const letter = update.grid[r][c];
            if (letter && letter !== '.' && curPuzzle.tiles[r][c].value !== letter) {
              tileUpdates.push({ row: r, column: c, value: letter as LetterType });
            }
          }
        }
        if (tileUpdates.length > 0) {
          const newVersion = randomId();
          updateWaveWithTileUpdates(tileUpdates, newVersion).then((newWave) => {
            if (newWave) {
              const newPuzzle = withPuzzleTileUpdates(curPuzzle, tileUpdates, newVersion);
              pushStateHistory({ wave: newWave, puzzle: newPuzzle });
              dispatch(setPuzzleState(newPuzzle));
            }
          });
        }
      } else {
        if (update.failureReason === 'unknownWords' && onUnknownWords) {
          onUnknownWords(update.unknownWords);
          return;
        }
        const reason = update.failureReason;
        const error =
          reason === 'timeout' ? 'Auto-Fill timed out before completing the puzzle.' :
          reason === 'maxSteps' ? 'Auto-Fill reached the step limit without completing the puzzle.' :
          reason === 'contradiction' ? 'Auto-Fill found a contradiction — the placed letters may be incompatible.' :
          'Auto-Fill could not find a valid fill for this puzzle.';
        setAutoFillErrorState({ error, puzzleVersion: curPuzzle.version });
      }
    };

    if (hasLocked || hasBanned) {
      const solvedGrid: string[][] = startPuzzle.tiles.map((row) =>
        row.map((tile) => (tile.value === 'black' || tile.value === 'empty' ? '' : tile.value))
      );

      const lockedSlotCells: Array<Array<{ row: number; col: number }>> = allSlots
        .filter((s) => lockedSlotsSet.has(s.key))
        .map((s) => s.cells);

      const removedSlotCells: Array<Array<{ row: number; col: number }>> = bannedSlots.map((s) => s.cells);

      const effectiveRemoved = removedSlotCells.length > 0
        ? removedSlotCells
        : allSlots.filter((s) => !lockedSlotsSet.has(s.key) && !s.word).map((s) => s.cells);

      if (effectiveRemoved.length === 0) {
        const placedLetters: Array<{ row: number; col: number; letter: string }> = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            const v = startPuzzle.tiles[r][c].value;
            if (v !== 'black' && v !== 'empty') placedLetters.push({ row: r, col: c, letter: v });
          }
        }
        WFCWorkerRef.current!
          .startFill(blacks, placedLetters, wordBankWords, currentBannedWords, seed, proxy(onProgress))
          .catch(() => { if (currentFillId === fillIdRef.current) setAutoFillRunning(false); });
        return;
      }

      WFCWorkerRef.current!
        .startRevision(
          blacks,
          solvedGrid,
          effectiveRemoved,
          lockedSlotCells,
          currentBannedWords,
          wordBankWords,
          seed,
          proxy(onProgress)
        )
        .catch(() => { if (currentFillId === fillIdRef.current) setAutoFillRunning(false); });
    } else {
      const placedLetters: Array<{ row: number; col: number; letter: string }> = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const v = startPuzzle.tiles[r][c].value;
          if (v !== 'black' && v !== 'empty') {
            placedLetters.push({ row: r, col: c, letter: v });
          }
        }
      }

      WFCWorkerRef.current
        .startFill(blacks, placedLetters, wordBankWords, currentBannedWords, seed, proxy(onProgress))
        .catch(() => {
          if (currentFillId === fillIdRef.current) setAutoFillRunning(false);
        });
    }
  }, [
    autoFillRunning,
    setAutoFillRunning,
    WFCWorkerRef,
    wordBankWords,
    dispatch,
    pushStateHistory,
    updateWaveWithTileUpdates,
    onUnknownWords,
  ]);

  const stopAutoFill = useCallback(() => {
    fillIdRef.current += 1;
    if (WFCWorkerRef.current) WFCWorkerRef.current.stopFill();
    setAutoFillRunning(false);
  }, [WFCWorkerRef, setAutoFillRunning]);

  const autoFillError = useMemo(() => autoFillErrorState?.error || null, [
    autoFillErrorState,
  ]);

  return { runAutoFill, stopAutoFill, autoFillError };
}
