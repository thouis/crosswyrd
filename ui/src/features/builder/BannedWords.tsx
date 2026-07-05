import _ from 'lodash';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Input,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Snackbar,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import DeleteIcon from '@mui/icons-material/Delete';
import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  CrosswordPuzzleType,
  addBannedWord,
  clearBannedWords,
  removeBannedWord,
  selectAlphabetLetters,
  selectBannedWords,
} from './builderSlice';

interface Props {
  puzzle: CrosswordPuzzleType;
  bankWords: string[];
}

function getFilledWords(puzzle: CrosswordPuzzleType): Set<string> {
  const tiles = puzzle.tiles;
  const size = tiles.length;
  const solid = (r: number, c: number) =>
    !tiles[r]?.[c] || tiles[r][c].value === 'black';
  const result = new Set<string>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (solid(r, c)) continue;

      if (solid(r, c - 1)) {
        const letters: string[] = [];
        for (let cc = c; cc < size && !solid(r, cc); cc++) {
          const v = tiles[r][cc].value;
          if (v === 'empty') { letters.length = 0; break; }
          letters.push(v);
        }
        if (letters.length >= 2) result.add(letters.join(''));
      }

      if (solid(r - 1, c)) {
        const letters: string[] = [];
        for (let rr = r; rr < size && !solid(rr, c); rr++) {
          const v = tiles[rr][c].value;
          if (v === 'empty') { letters.length = 0; break; }
          letters.push(v);
        }
        if (letters.length >= 2) result.add(letters.join(''));
      }
    }
  }
  return result;
}

export default function BannedWords({ puzzle, bankWords }: Props) {
  const dispatch = useDispatch();
  const bannedWords = useSelector(selectBannedWords);
  const alphabetLetters = useSelector(selectAlphabetLetters);
  const alphabetSet = useMemo(() => new Set(alphabetLetters), [alphabetLetters]);
  const [inputWord, setInputWord] = useState('');
  const [bankWarningOpen, setBankWarningOpen] = useState(false);
  const [bankWarningWord, setBankWarningWord] = useState('');

  const filledWords = useMemo(() => getFilledWords(puzzle), [puzzle]);
  const bankWordsSet = useMemo(() => new Set(bankWords), [bankWords]);

  const handleChangeInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputWord(
      _.join(
        _.take(
          _.filter(_.toLower(event.target.value), (c) => alphabetSet.has(c)),
          puzzle.tiles.length
        ),
        ''
      )
    );
  };

  const handleBan = () => {
    if (!inputWord) return;
    dispatch(addBannedWord(inputWord));
    if (bankWordsSet.has(inputWord)) {
      setBankWarningWord(inputWord.toUpperCase());
      setBankWarningOpen(true);
    }
    setInputWord('');
  };

  const mkHandleUnban = (word: string) => () => {
    dispatch(removeBannedWord(word));
  };

  const handleClearAll = () => {
    dispatch(clearBannedWords());
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Input
          placeholder="Word to ban"
          value={inputWord.toUpperCase()}
          onChange={handleChangeInput}
          startAdornment={
            <InputAdornment position="start">
              <BlockIcon fontSize="small" />
            </InputAdornment>
          }
          onKeyPress={(event) => {
            if (event.key === 'Enter') handleBan();
          }}
          style={{ width: 160 }}
        />
        <Button
          size="small"
          variant="contained"
          color="error"
          disabled={!inputWord}
          onClick={handleBan}
        >
          Ban
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          disabled={bannedWords.length === 0}
          onClick={handleClearAll}
        >
          Clear all
        </Button>
      </Box>

      {bannedWords.length === 0 ? (
        <span style={{ fontStyle: 'italic', marginTop: 20, textAlign: 'center' }}>
          No banned words yet. Type a word above and click Ban.
        </span>
      ) : (
        <List dense sx={{ overflowY: 'auto', flex: 1 }}>
          {_.map(_.sortBy(bannedWords), (word) => {
            const inGrid = filledWords.has(word);
            return (
              <ListItem
                key={word}
                disablePadding
                secondaryAction={
                  <IconButton size="small" onClick={mkHandleUnban(word)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    pl: 1,
                    width: '100%',
                  }}
                >
                  {inGrid && (
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: 'error.main',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <ListItemText
                    primary={word.toUpperCase()}
                    sx={{ color: inGrid ? 'error.main' : 'text.primary' }}
                  />
                </Box>
              </ListItem>
            );
          })}
        </List>
      )}

      <Snackbar
        open={bankWarningOpen}
        autoHideDuration={4000}
        onClose={() => setBankWarningOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setBankWarningOpen(false)}>
          "{bankWarningWord}" is in your word bank.
        </Alert>
      </Snackbar>
    </Box>
  );
}
