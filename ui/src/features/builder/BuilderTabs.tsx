// This is adapted from https://mui.com/material-ui/react-tabs/
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import React, { MutableRefObject, useLayoutEffect } from 'react';
import { useDispatch } from 'react-redux';

import { setCurrentTab } from './builderSlice';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  style?: any;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      <Box
        style={{
          visibility: value === index ? 'visible' : 'hidden',
          paddingTop: 8,
        }}
      >
        {children}
      </Box>
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

interface Props {
  currentTab: number;
  tilesSelected: boolean;
  preserveTabRef: MutableRefObject<boolean>;
  clearSelection: () => void;
  wordSelector: React.ReactNode;
  wordBank: React.ReactNode;
  clueEntry: React.ReactNode;
  bannedWords: React.ReactNode;
}

function BuilderTabs({
  currentTab,
  tilesSelected,
  preserveTabRef,
  clearSelection,
  wordSelector,
  wordBank,
  clueEntry,
  bannedWords,
}: Props) {
  const dispatch = useDispatch();

  // Set tab to "Fill" when tiles are selected, unless the selection came from
  // an action (undo/redo/auto-fill) that should leave the current tab alone
  useLayoutEffect(() => {
    const preserve = preserveTabRef.current;
    preserveTabRef.current = false;
    if (tilesSelected && currentTab === 1 && !preserve) dispatch(setCurrentTab(0));
  }, [tilesSelected, dispatch, currentTab, preserveTabRef]);

  const handleChange = (event: React.SyntheticEvent, newCurrentTab: number) => {
    // Clear selection if moved tab to "Word Bank"
    if (newCurrentTab === 1) clearSelection();
    dispatch(setCurrentTab(newCurrentTab));
  };

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={currentTab}
          onChange={handleChange}
          aria-label="basic tabs example"
        >
          <Tab label="Fill" {...a11yProps(0)} sx={{ minWidth: 0, px: 1.5, justifyContent: 'flex-end' }} />
          <Tab label={<span style={{ lineHeight: 1.2 }}>Word<br />Bank</span>} {...a11yProps(1)} sx={{ minWidth: 0, px: 1.5, justifyContent: 'flex-end' }} />
          <Tab label="Clues" {...a11yProps(2)} sx={{ minWidth: 0, px: 1.5, justifyContent: 'flex-end' }} />
          <Tab label="Banned" {...a11yProps(3)} sx={{ minWidth: 0, px: 1.5, justifyContent: 'flex-end' }} />
        </Tabs>
      </Box>
      <TabPanel value={currentTab} index={0}>
        {wordSelector}
      </TabPanel>
      <TabPanel value={currentTab} index={1}>
        {wordBank}
      </TabPanel>
      <TabPanel value={currentTab} index={2}>
        {clueEntry}
      </TabPanel>
      <TabPanel value={currentTab} index={3}>
        {bannedWords}
      </TabPanel>
    </Box>
  );
}

export default React.memo(BuilderTabs);
