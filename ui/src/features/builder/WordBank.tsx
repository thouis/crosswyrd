import _ from 'lodash';
import {
  Box,
  Button,
  Chip,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Input,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import CreateIcon from '@mui/icons-material/Create';
import DeleteIcon from '@mui/icons-material/Delete';
import DoneIcon from '@mui/icons-material/Done';
import LockIcon from '@mui/icons-material/Lock';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  CrosswordPuzzleType,
  selectAlphabetLetters,
  setDraggedWord,
  selectDraggedWord,
  selectLockedSlots,
  selectBannedWords,
  TileType,
} from './builderSlice';
import { LocationType } from './CrosswordBuilder';
import { ElementType, WaveType } from './useWaveFunctionCollapse';

function getSlotWord(puzzle: CrosswordPuzzleType, key: string): string {
  const parts = key.split(',');
  const r = parseInt(parts[0]);
  const c = parseInt(parts[1]);
  const direction = parts[2];
  const tiles = puzzle.tiles;
  const size = tiles.length;
  const letters: string[] = [];
  if (direction === 'across') {
    for (let cc = c; cc < size && tiles[r]?.[cc]?.value !== 'black'; cc++) {
      const v = tiles[r][cc].value;
      if (v === 'empty') return '';
      letters.push(v);
    }
  } else {
    for (let rr = r; rr < size && tiles[rr]?.[c]?.value !== 'black'; rr++) {
      const v = tiles[rr][c].value;
      if (v === 'empty') return '';
      letters.push(v);
    }
  }
  return letters.join('');
}

export function getAllElementSets(
  puzzle: CrosswordPuzzleType,
  wave: WaveType | null
): ElementType[][] {
  if (!wave) return [];
  // Returns a list of all possible wave element sets (across and down)
  const solid = (tile: TileType): boolean => !tile || tile.value === 'black';
  return _.reject(
    _.flatMap(puzzle.tiles, (row, rowIndex) =>
      _.flatMap(row, (tile, columnIndex) => {
        const leftTile = puzzle.tiles[rowIndex]?.[columnIndex - 1];
        const aboveTile = puzzle.tiles?.[rowIndex - 1]?.[columnIndex];
        return _.compact([
          solid(leftTile) &&
            _.map(
              _.takeWhile(
                _.range(puzzle.tiles.length),
                (index) => !solid(puzzle.tiles[rowIndex]?.[columnIndex + index])
              ),
              (index) => wave.elements[rowIndex][columnIndex + index]
            ),
          solid(aboveTile) &&
            _.map(
              _.takeWhile(
                _.range(puzzle.tiles.length),
                (index) =>
                  !solid(puzzle.tiles?.[rowIndex + index]?.[columnIndex])
              ),
              (index) => wave.elements[rowIndex + index][columnIndex]
            ),
        ]);
      })
    ),
    (set) => set.length === 0
  );
}

function computeWordEntry(
  allElementSets: ElementType[][],
  word: string
): WordEntry {
  const allMatchingElementSets = _.filter(
    allElementSets,
    (elements) =>
      elements.length === word.length &&
      _.every(word, (letter, index) =>
        _.includes(elements[index].options, letter)
      )
  );
  const unusedValidLocationSets = _.map(
    _.filter(
      allMatchingElementSets,
      (elements) =>
        !_.every(elements, (element) => element.options.length === 1)
    ),
    (elements) => _.map(elements, ({ row, column }) => ({ row, column }))
  );

  return {
    word,
    used: allMatchingElementSets.length !== unusedValidLocationSets.length,
    validLocationSets: unusedValidLocationSets,
  };
}

interface WordEntry {
  word: string;
  used: boolean;
  validLocationSets: LocationType[][];
}
interface WordLocationOptionsType {
  across: LocationType[] | null;
  down: LocationType[] | null;
}
export type WordLocationsGridType = WordLocationOptionsType[][];

function buildWordLocationsGrid(
  puzzle: CrosswordPuzzleType,
  entry: WordEntry
): WordLocationsGridType {
  const grid: WordLocationsGridType = _.times(puzzle.tiles.length, (rowIndex) =>
    _.times(puzzle.tiles.length, (columnIndex) => ({
      across: null,
      down: null,
    }))
  );
  _.forEach(entry.validLocationSets, (locations) => {
    const direction =
      locations.length > 1 && locations[1].column > locations[0].column
        ? 'across'
        : 'down';
    _.forEach(locations, ({ row, column }) => {
      grid[row][column][direction] = locations;
    });
  });
  return grid;
}

interface Props {
  wave: WaveType | null;
  puzzle: CrosswordPuzzleType;
  setWordLocationsGrid: (grid: WordLocationsGridType | null) => void;
  words: string[];
  setWords: (words: string[]) => void;
}

function WordBank({ wave, puzzle, setWordLocationsGrid, words, setWords }: Props) {
  const [currentWord, setCurrentWord] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const draggedWord = useSelector(selectDraggedWord);
  const lockedSlots = useSelector(selectLockedSlots);
  const bannedWords = useSelector(selectBannedWords);
  const alphabetLetters = useSelector(selectAlphabetLetters);
  const alphabetSet = useMemo(() => new Set(alphabetLetters), [alphabetLetters]);

  const dispatch = useDispatch();

  const lockedWordsSet = useMemo(() => {
    const s = new Set<string>();
    for (const key of lockedSlots) {
      const word = getSlotWord(puzzle, key);
      if (word) s.add(word);
    }
    return s;
  }, [puzzle, lockedSlots]);

  const bannedWordsSet = useMemo(() => new Set(bannedWords), [bannedWords]);

  // Cancel word locations grid when dragging stops
  useEffect(() => {
    if (!draggedWord) setWordLocationsGrid(null);
  }, [setWordLocationsGrid, draggedWord]);

  const allElementSets = useMemo(() => getAllElementSets(puzzle, wave), [
    puzzle,
    wave,
  ]);

  const wordBank: WordEntry[] = useMemo(
    () => _.map(words, (word) => computeWordEntry(allElementSets, word)),
    [allElementSets, words]
  );

  const handleChangeCurrentWordValue = (event) => {
    setCurrentWord(
      _.join(
        _.take(
          _.filter(_.toLower(event.target.value), (char) =>
            alphabetSet.has(char)
          ),
          puzzle.tiles.length
        ),
        ''
      )
    );
  };
  const handleInsertCurrentWord = () => {
    setCurrentWord('');
    if (_.includes(words, currentWord)) return;
    setWords(_.sortBy([...words, currentWord]));
  };
  const mkHandleClickWord = (index) => () => {
    dispatch(setDraggedWord(wordBank[index].word));
  };
  const handleClickToStopDragging = () => {
    if (draggedWord) dispatch(setDraggedWord(null));
  };
  const mkHandleHoverWord = (index) => () => {
    setWordLocationsGrid(buildWordLocationsGrid(puzzle, wordBank[index]));
  };
  const mkHandleDeleteEntry = (index) => () => {
    setWords(_.sortBy(_.without(words, words[index])));
  };
  const handleBulkImport = () => {
    const maxLen = puzzle.tiles.length;
    const newWords = _.uniq(
      bulkText
        .split(/[\s,;|/\\]+/)
        .map((w) =>
          _.join(
            _.take(
              _.filter(_.toLower(w), (c) => alphabetSet.has(c)),
              maxLen
            ),
            ''
          )
        )
        .filter((w) => w.length > 0)
    );
    setWords(_.sortBy(_.uniq([...words, ...newWords])));
    setBulkText('');
    setBulkOpen(false);
  };
  const handleMouseOut = () => {
    const entry = _.find(wordBank, ['word', draggedWord]);
    if (draggedWord && entry)
      setWordLocationsGrid(buildWordLocationsGrid(puzzle, entry));
    else setWordLocationsGrid(null);
  };

  return (
    <ClickAwayListener onClickAway={handleClickToStopDragging}>
      <div className="word-bank-container" onClick={handleClickToStopDragging}>
        <div
          className="word-bank-input-container"
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <Input
            placeholder="Write a word"
            style={{ width: 170 }}
            onChange={handleChangeCurrentWordValue}
            value={_.toUpper(currentWord)}
            startAdornment={
              <InputAdornment position="start">
                <CreateIcon fontSize="small" />
              </InputAdornment>
            }
            onKeyPress={(event) => {
              if (event.key === 'Enter') handleInsertCurrentWord();
            }}
          />
          <Button
            size="small"
            style={{ marginLeft: 5 }}
            variant="contained"
            startIcon={<DoneIcon />}
            disabled={!currentWord}
            onClick={handleInsertCurrentWord}
          >
            Add
          </Button>
          <Button
            size="small"
            style={{ marginLeft: 'auto' }}
            variant="outlined"
            startIcon={<PlaylistAddIcon />}
            onClick={() => setBulkOpen(true)}
          >
            Bulk
          </Button>
        </div>
        <Dialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Bulk import words</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              multiline
              fullWidth
              minRows={8}
              placeholder="Paste words separated by spaces, commas, or newlines"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!bulkText.trim()}
              onClick={handleBulkImport}
            >
              Import
            </Button>
          </DialogActions>
        </Dialog>
        <Box
          className="word-bank-list-box-container"
          sx={{ width: '100%', maxWidth: 360, bgcolor: 'background.paper' }}
        >
          {wordBank.length > 0 ? (
            <List
              className="word-bank-list-container"
              onMouseOut={handleMouseOut}
            >
              {_.map(wordBank, (entry, index) => (
                <ListItem
                  key={entry.word}
                  disablePadding
                  component="div"
                  style={{ position: 'relative' }}
                >
                  <ListItemButton
                    disabled={
                      entry.used ||
                      entry.validLocationSets.length === 0 ||
                      !!draggedWord
                    }
                    onClick={mkHandleClickWord(index)}
                    onMouseOver={mkHandleHoverWord(index)}
                    divider
                  >
                    <ListItemText primary={_.toUpper(entry.word)} />
                    {bannedWordsSet.has(entry.word) ? (
                      <BlockIcon fontSize="small" sx={{ color: 'error.main', mr: 1 }} />
                    ) : lockedWordsSet.has(entry.word) ? (
                      <LockIcon fontSize="small" sx={{ color: 'success.main', mr: 1 }} />
                    ) : null}
                    <Chip
                      style={{ marginRight: 40 }}
                      color={
                        entry.used
                          ? 'warning'
                          : entry.validLocationSets.length > 0
                          ? 'success'
                          : 'error'
                      }
                      variant={
                        entry.used
                          ? 'filled'
                          : entry.validLocationSets.length > 0
                          ? 'filled'
                          : 'outlined'
                      }
                      label={
                        entry.used
                          ? 'Used'
                          : `${entry.validLocationSets.length} option${
                              entry.validLocationSets.length === 1 ? '' : 's'
                            }`
                      }
                    />
                  </ListItemButton>
                  <IconButton
                    disabled={entry.used || !!draggedWord}
                    size="small"
                    style={{ position: 'absolute', right: 15 }}
                    onClick={mkHandleDeleteEntry(index)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <span className="word-bank-comment">
              Add a word to see where it fits on the board!
            </span>
          )}
        </Box>
      </div>
    </ClickAwayListener>
  );
}

export default React.memo(WordBank);
