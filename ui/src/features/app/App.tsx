import React from 'react';
import { Helmet } from 'react-helmet';
import {
  BrowserRouter as Router,
  Switch,
  Redirect,
  Route,
} from 'react-router-dom';

import { devMode } from '../../app/util';
import Crosswyrd from './Crosswyrd';
import LandingPage from '../landingPage/LandingPage';
import CrosswordPlayer from '../player/CrosswordPlayer';
import StateProvider from './StateProvider';

import './App.css';

const VERSION_BADGE: React.CSSProperties = {
  position: 'fixed', bottom: 8, right: 12,
  fontSize: 13, fontWeight: 'bold', color: '#fff',
  background: 'rgba(0,0,0,0.45)', borderRadius: 4, padding: '2px 6px',
  pointerEvents: 'none', zIndex: 9999,
};

function App() {
  return (
    <>
      <span style={VERSION_BADGE}>pr2</span>
      {devMode() && (
        <Helmet>
          <link rel="icon" href={`${process.env.PUBLIC_URL}/favicon-dev.ico`} />
        </Helmet>
      )}
      <Router>
        <Switch>
          <Route path="/builder">
            <StateProvider stateKey="builder">
              <Crosswyrd />
            </StateProvider>
          </Route>
          <Route path="/puzzles/:puzzleId">
            <StateProvider stateKey="player">
              <CrosswordPlayer />
            </StateProvider>
          </Route>
          <Route path="/">
            <StateProvider stateKey="landing">
              <LandingPage />
            </StateProvider>
          </Route>
          <Redirect to="/" />
        </Switch>
      </Router>
    </>
  );
}
export default App;
