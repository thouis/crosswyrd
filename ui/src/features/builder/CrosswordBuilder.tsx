import _ from 'lodash';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Slide,
  Snackbar,
} from '@mui/material';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Helmet } from 'react-helmet';
import { useDispatch, useSelector } from 'react-redux';

import { GridWithVersionType } from '../app/Crosswyrd';
import {
  CrosswordPuzzleType,
  selectCurrentTab,
  selectDraggedWord,
  selectFillAssistActive,
  selectPuzzle,
  selectLockedSlots,
  selectBannedWords,
  clearLockedSlots,
  setDraggedWord,
  setPuzzleState,
  setPuzzleTileValues,
  slotKey,
  TileValueType,
} from './builderSlice';
import { buildSlotTopology } from './fillEngine';
import BannedWords from './BannedWords';
import BuilderTabs from './BuilderTabs';
import ClueEntry, { useClueData } from './ClueEntry';
import { ALL_LETTERS } from './constants';
import DraggedWord from './DraggedWord';
import PuzzleBanner from './PuzzleBanner';
import PuzzleStats from './PuzzleStats';
import Tiles from './Tiles';
import useAutoFill from './useAutoFill';
import useDictionary from './useDictionary';
import useTileInput from './useTileInput';
import useTileSelection from './useTileSelection';
import useWaveAndPuzzleHistory from './useWaveAndPuzzleHistory';
import useWaveFunctionCollapse, {
  waveFromPuzzle,
  WaveType,
} from './useWaveFunctionCollapse';
import WordBank, { WordLocationsGridType } from './WordBank';
import WordSelector from './WordSelector';
import { randomId } from '../../app/util';

import './CrosswordBuilder.css';

export interface LocationType {
  row: number;
  column: number;
}

const WAVE_DEBOUNCE_MS = 500;
const debouncedUpdateWave = _.debounce(
  (func: () => void) => func(),
  WAVE_DEBOUNCE_MS
);

const AlertSnackbar = React.memo(
  ({ open, error }: { open: boolean; error: string }) => {
    return (
      <Snackbar
        open={open}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        TransitionComponent={(props) => <Slide {...props} direction="down" />}
      >
        <Alert severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    );
  }
);

export function puzzleCannotBeFilled(
  puzzle: CrosswordPuzzleType,
  wave: WaveType
): boolean {
  // Returns true if the puzzle wave has some contradiction (a non-black tile
  // has 0 letter options)
  return _.some(puzzle.tiles, (row, rowIndex) =>
    _.some(
      row,
      (tile, columnIndex) =>
        tile.value !== 'black' &&
        wave.elements[rowIndex][columnIndex].options.length === 0
    )
  );
}

interface Props {
  grid: GridWithVersionType;
}
export default function CrosswordBuilder({ grid }: Props) {
  const puzzle = useSelector(selectPuzzle);
  const draggedWord = useSelector(selectDraggedWord);
  const currentTab = useSelector(selectCurrentTab);
  const fillAssistActive = useSelector(selectFillAssistActive);
  const lockedSlots = useSelector(selectLockedSlots);
  const bannedWords = useSelector(selectBannedWords);
  const { dictionary, addWordsToDictionary } = useDictionary();
  const { tileNumbers } = useClueData(puzzle);
  const [wordBankWords, setWordBankWords] = useState<string[]>([]);
  const {
    wave,
    updateWaveWithTileUpdates,
    updateWave,
    setWaveState,
    busy: WFCBusy,
    wordIndexReady,
    WFCWorkerRef,
  } = useWaveFunctionCollapse(puzzle, wordBankWords);
  const {
    popStateHistory,
    popStateFuture,
    pushStateHistory,
    checkHistoryEmpty,
    checkFutureEmpty,
  } = useWaveAndPuzzleHistory(wave, puzzle);
  const [hoveredTile, setHoveredTile] = useState<LocationType | null>(null);
  const [wordLocationsGrid, setWordLocationsGrid] =
    useState<WordLocationsGridType | null>(null);
  const [autoFillRunning, setAutoFillRunning] = useState(false);
  const [symmetricBlackTiles, setSymmetricBlackTiles] = useState(true);
  const [unknownWordsDialog, setUnknownWordsDialog] = useState<string[] | null>(null);

  const handleUnknownWords = useCallback((words: string[]) => {
    setAutoFillRunning(false);
    setUnknownWordsDialog(words);
  }, [setAutoFillRunning]);

  const {
    onClick,
    updateSelection,
    selectedTilesState,
    clearSelection,
    selectBestNext,
    selectNextAnswer,
  } = useTileSelection(puzzle, wave, WFCBusy, autoFillRunning);
  const clearHoveredTile = useCallback(
    () => setHoveredTile(null),
    [setHoveredTile]
  );
  useTileInput(
    puzzle,
    selectedTilesState,
    updateSelection,
    clearHoveredTile,
    selectNextAnswer,
    selectBestNext,
    false,
    { symmetricBlackTiles }
  );

  const dispatch = useDispatch();
  // Set right before an action that may re-select tiles but that shouldn't
  // yank the user over to the Fill tab (undo/redo/auto-fill); BuilderTabs
  // consumes and clears this itself.
  const preserveTabRef = useRef(false);
  const stepBack = useCallback(
    (times: number = 1) => {
      const previousState = popStateHistory(times);
      if (!previousState) return;
      preserveTabRef.current = true;
      setWaveState(previousState.wave, previousState.puzzle);
      dispatch(setPuzzleState(previousState.puzzle));
      if (previousState.selectedTilesState)
        updateSelection(
          previousState.selectedTilesState.primaryLocation,
          previousState.selectedTilesState.direction
        );
      else if (!autoFillRunning && currentTab === 0)
        selectBestNext(previousState);
      return previousState;
    },
    [
      dispatch,
      setWaveState,
      popStateHistory,
      updateSelection,
      selectBestNext,
      autoFillRunning,
      currentTab,
    ]
  );
  const stepForward = useCallback(() => {
    const nextState = popStateFuture();
    if (!nextState) return;
    preserveTabRef.current = true;
    setWaveState(nextState.wave, nextState.puzzle);
    dispatch(setPuzzleState(nextState.puzzle));
    if (nextState.selectedTilesState)
      updateSelection(
        nextState.selectedTilesState.primaryLocation,
        nextState.selectedTilesState.direction
      );
    return nextState;
  }, [dispatch, setWaveState, popStateFuture, updateSelection]);
  const {
    runAutoFill: runAutoFillInner,
    stopAutoFill,
    autoFillError,
  } = useAutoFill(
    puzzle,
    autoFillRunning,
    setAutoFillRunning,
    pushStateHistory,
    WFCWorkerRef,
    updateWaveWithTileUpdates,
    wordBankWords,
    handleUnknownWords
  );
  const runAutoFill = useCallback(() => {
    preserveTabRef.current = true;
    runAutoFillInner();
  }, [runAutoFillInner]);

  // Update the wave with changes to the puzzle
  const prevPuzzleVersion = useRef(puzzle.version);
  useEffect(() => {
    // If the puzzle's version hasn't changed, skip.
    if (prevPuzzleVersion.current === puzzle.version) return;
    // If auto-fill is running, then we defer to that to update our puzzle
    // version correctly--we should ignore any out-of-date waves for the time
    // being.
    if (autoFillRunning) prevPuzzleVersion.current = puzzle.version;
    // Only try to update if the wave is outdated, and we are not auto-filling.
    if (
      !dictionary ||
      !wave ||
      wave.puzzleVersion === puzzle.version ||
      autoFillRunning ||
      WFCBusy
    )
      return;
    debouncedUpdateWave(() => {
      updateWave(dictionary, addWordsToDictionary, selectedTilesState).then(
        (result) => {
          if (!result) return;
          prevPuzzleVersion.current = result.puzzle.version;
          // This may get called a lot due to the nature of `debounce`, but this
          // is OK--this function has lots of safeguards against this.
          pushStateHistory({
            wave: result.wave,
            puzzle: result.puzzle,
            selectedTilesState: result.selectedTilesState,
          });
        }
      );
    });
  }, [
    puzzle,
    wave,
    dictionary,
    addWordsToDictionary,
    updateWave,
    pushStateHistory,
    selectedTilesState,
    autoFillRunning,
    WFCBusy,
  ]);

  const { lockedCellKeys, bannedCellKeys } = useMemo(() => {
    const size = puzzle.tiles.length;
    const blacks = puzzle.tiles.map((row) => row.map((t) => t.value === 'black'));
    const { slots } = buildSlotTopology(size, blacks);
    const lockedKeySet = new Set(lockedSlots);
    const bannedSet = new Set(bannedWords);
    const lockedCells = new Set<string>();
    const bannedCells = new Set<string>();
    for (const slot of slots) {
      const key = slotKey(slot.cells[0].row, slot.cells[0].col, slot.direction);
      if (lockedKeySet.has(key)) {
        for (const { row, col } of slot.cells) lockedCells.add(`${row},${col}`);
      }
      const word = slot.cells
        .map(({ row, col }) => {
          const v = puzzle.tiles[row][col].value;
          return v === 'empty' || v === 'black' ? '' : v;
        })
        .join('');
      if (word.length === slot.cells.length && bannedSet.has(word)) {
        for (const { row, col } of slot.cells) bannedCells.add(`${row},${col}`);
      }
    }
    return { lockedCellKeys: lockedCells, bannedCellKeys: bannedCells };
  }, [puzzle, lockedSlots, bannedWords]);

  const puzzleError = useMemo(() => {
    if (autoFillRunning || !wave) return '';
    if (autoFillError) return autoFillError;
    if (puzzleCannotBeFilled(puzzle, wave))
      return 'The puzzle cannot be filled from here! Try undoing recent changes, clearing up any red tiles, or adjusting the grid pattern.';
    return '';
  }, [autoFillRunning, puzzle, wave, autoFillError]);
  const showPuzzleError = useMemo(() => !!puzzleError, [puzzleError]);

  // Set puzzle to grid when the grid is updated
  const currentGridVersion = useRef<string>(grid.version);
  useEffect(() => {
    if (grid.version === currentGridVersion.current) return;
    currentGridVersion.current = grid.version;
    clearSelection();
    const newPuzzle: CrosswordPuzzleType = {
      tiles: _.map(grid.tiles, (row) =>
        _.map(row, (tile) => ({ value: tile ? 'black' : 'empty' }))
      ),
      version: randomId(),
    };
    const newWave: WaveType = waveFromPuzzle(newPuzzle);
    pushStateHistory({ wave: newWave, puzzle: newPuzzle });
    dispatch(setPuzzleState(newPuzzle));
    setWaveState(newWave, newPuzzle);
  }, [grid, dispatch, setWaveState, clearSelection, pushStateHistory]);

  const clearLetters = useCallback(() => {
    if (!wave) return;
    const newPuzzle: CrosswordPuzzleType = {
      tiles: _.map(puzzle.tiles, (row) =>
        _.map(row, (tile) => ({
          value: tile.value === 'black' ? 'black' : 'empty',
        }))
      ),
      version: randomId(),
    };
    const newWave = waveFromPuzzle(newPuzzle);
    pushStateHistory({ wave: newWave, puzzle: newPuzzle });
    setWaveState(newWave, newPuzzle);
    dispatch(setPuzzleState(newPuzzle));
    dispatch(clearLockedSlots());
  }, [dispatch, setWaveState, puzzle, pushStateHistory, wave]);

  const handleClickBack = () => {
    stepBack();
  };
  const mkHandleMouseoverTile = useCallback((row, column) => {
    return () => setHoveredTile({ row, column });
  }, []);
  const handleEnterWord = useCallback(
    (rawWord: string, customTileLocations?: LocationType[]) => {
      const tileLocations =
        customTileLocations || selectedTilesState?.locations || [];

      // At least clear the selection
      clearSelection();

      // Sanitize the word, making it full-length and replacing ?s and empty
      // slots with " "s.
      const word = _.join(
        _.times(tileLocations.length, (index) =>
          rawWord[index] === '?' ? ' ' : (rawWord[index] ?? ' ')
        ),
        ''
      );

      if (
        !dictionary ||
        !wave ||
        WFCBusy ||
        // The word must be full-length
        word.length !== tileLocations.length ||
        // The word must be a valid type (" "s are OK)
        !_.every(
          word,
          (letter) => _.includes(ALL_LETTERS, letter) || letter === ' '
        )
      )
        return;

      // Build observations, replacing " "s with "empty"
      const observations = _.map(word, (letter, index) => ({
        ...tileLocations[index],
        value: (letter === ' ' ? 'empty' : letter) as TileValueType,
      }));
      if (
        _.every(
          observations,
          ({ row, column, value }) => puzzle.tiles[row][column].value === value
        )
      )
        return;

      dispatch(setPuzzleTileValues(observations));
      // A bit hacky, but force the wave to be updated immediately after our
      // hook has had a chance to call the wave-update endpoint
      setTimeout(() => debouncedUpdateWave.flush(), 10);
    },
    [
      dispatch,
      WFCBusy,
      puzzle,
      wave,
      dictionary,
      selectedTilesState,
      clearSelection,
    ]
  );

  const selectedOptionsSet = useMemo(
    () =>
      wave
        ? _.map(
            selectedTilesState?.locations || [],
            ({ row, column }) => wave.elements[row][column].options
          )
        : _.map(selectedTilesState?.locations || [], ({ row, column }) => []),
    [selectedTilesState, wave]
  );
  const tilesSelected = useMemo(
    () => (selectedTilesState?.locations?.length || 0) > 0,
    [selectedTilesState]
  );
  const onTilesMouseOut = useCallback(() => setHoveredTile(null), []);
  const mkHandleClickTile = useCallback(
    (row, column, hoveredTile: LocationType | null) => {
      return (event) => {
        if (draggedWord) {
          dispatch(setDraggedWord(null));

          const wordLocationOptions: LocationType[] | null =
            hoveredTile &&
            wordLocationsGrid &&
            (wordLocationsGrid[hoveredTile.row][hoveredTile.column].across ||
              wordLocationsGrid[hoveredTile.row][hoveredTile.column].down);
          if (wordLocationOptions)
            handleEnterWord(draggedWord, wordLocationOptions);
        } else {
          onClick(row, column);
        }
      };
    },
    [onClick, wordLocationsGrid, handleEnterWord, dispatch, draggedWord]
  );

  return (
    <div className="content-container">
      <Helmet>
        <title>Crosswyrd - Builder</title>
      </Helmet>
      <div className="puzzle-builder-container">
        <div className="puzzle-container sheet">
          <PuzzleBanner
            WFCBusy={WFCBusy}
            autoFillRunning={autoFillRunning}
            autoFillErrored={!!puzzleError}
            runAutoFill={runAutoFill}
            stopAutoFill={stopAutoFill}
            undo={handleClickBack}
            undoDisabled={WFCBusy || autoFillRunning || checkHistoryEmpty()}
            redo={stepForward}
            redoDisabled={WFCBusy || autoFillRunning || checkFutureEmpty()}
            clearLetters={clearLetters}
            clearSelection={clearSelection}
            selectBestNext={selectBestNext}
            setSymmetricBlackTiles={setSymmetricBlackTiles}
            symmetricBlackTiles={symmetricBlackTiles}
          />
          <Tiles
            puzzle={puzzle}
            wave={wave}
            tileNumbers={tileNumbers}
            selectedTilesState={selectedTilesState}
            wordLocationsGrid={wordLocationsGrid}
            hoveredTile={hoveredTile}
            draggedWord={draggedWord}
            mkHandleClickTile={mkHandleClickTile}
            mkHandleMouseoverTile={mkHandleMouseoverTile}
            onMouseOut={onTilesMouseOut}
            lockedCellKeys={lockedCellKeys}
            bannedCellKeys={bannedCellKeys}
          />
          <PuzzleStats puzzle={puzzle} />
        </div>
        <div className="sidebar-container sheet">
          {dictionary && (
            <>
              <BuilderTabs
                currentTab={currentTab}
                tilesSelected={tilesSelected}
                preserveTabRef={preserveTabRef}
                clearSelection={clearSelection}
                wordSelector={
                  <WordSelector
                    dictionary={dictionary}
                    wave={wave}
                    puzzle={puzzle}
                    optionsSet={selectedOptionsSet}
                    selectedTilesState={selectedTilesState}
                    onEnter={handleEnterWord}
                    clearSelection={clearSelection}
                    autoFillRunning={autoFillRunning}
                    fillAssistActive={fillAssistActive}
                    WFCWorkerRef={WFCWorkerRef}
                  />
                }
                wordBank={
                  <WordBank
                    wave={wave}
                    puzzle={puzzle}
                    setWordLocationsGrid={setWordLocationsGrid}
                    words={wordBankWords}
                    setWords={setWordBankWords}
                  />
                }
                clueEntry={
                  <ClueEntry
                    puzzle={puzzle}
                    tileNumbers={tileNumbers}
                    updateSelection={updateSelection}
                    selectedTilesState={selectedTilesState}
                  />
                }
                bannedWords={
                  <BannedWords puzzle={puzzle} bankWords={wordBankWords} />
                }
              />
            </>
          )}
        </div>
        <DraggedWord />
      </div>
      <AlertSnackbar open={showPuzzleError} error={puzzleError} />
      <Dialog open={!!unknownWordsDialog} onClose={() => setUnknownWordsDialog(null)}>
        <DialogTitle>Unknown Words in Puzzle</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The following {unknownWordsDialog?.length === 1 ? 'word is' : 'words are'} in the
            puzzle but not in the dictionary or Word Bank:{' '}
            <strong>{unknownWordsDialog?.map(w => w.toUpperCase()).join(', ')}</strong>.
            Add {unknownWordsDialog?.length === 1 ? 'it' : 'them'} to the Word Bank to allow
            revision fill to proceed?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnknownWordsDialog(null)}>No, cancel fill</Button>
          <Button
            variant="contained"
            onClick={() => {
              const words = unknownWordsDialog ?? [];
              setWordBankWords(_.sortBy(Array.from(new Set(wordBankWords.concat(words)))));
              setUnknownWordsDialog(null);
              setTimeout(runAutoFill, 0);
            }}
          >
            Add to Word Bank
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
