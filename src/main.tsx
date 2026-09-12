import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './AppRoot';
import { MatchRouteRoot } from './MatchRouteRoot';
import { ScoutRouteRoot } from './ScoutRouteRoot';
import { MatchNavigationEnhancer } from './components/MatchNavigationEnhancer';
import { ScoutNavigationEnhancer } from './components/ScoutNavigationEnhancer';
import './styles.css';
import './verified-workplace.css';

const root = window.location.pathname.startsWith('/matches')
  ? <MatchRouteRoot />
  : window.location.pathname.startsWith('/scouts')
    ? <ScoutRouteRoot />
    : <AppRoot />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      {root}
      <MatchNavigationEnhancer />
      <ScoutNavigationEnhancer />
    </>
  </StrictMode>,
);
