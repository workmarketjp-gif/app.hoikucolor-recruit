import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { MatchNavigationEnhancer } from './components/MatchNavigationEnhancer';
import { ScoutNavigationEnhancer } from './components/ScoutNavigationEnhancer';
import './styles.css';
import './verified-workplace.css';

const AppRoot = lazy(() => import('./AppRoot').then((module) => ({ default: module.AppRoot })));
const MatchRouteRoot = lazy(() => import('./MatchRouteRoot').then((module) => ({ default: module.MatchRouteRoot })));
const ScoutRouteRoot = lazy(() => import('./ScoutRouteRoot').then((module) => ({ default: module.ScoutRouteRoot })));

const defaultRoot = window.location.pathname.startsWith('/scouts') ? <ScoutRouteRoot /> : <AppRoot />;
const root = window.location.pathname.startsWith('/matches') ? <MatchRouteRoot /> : defaultRoot;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <Suspense fallback={<div className="centered-state"><span className="loading-ring" /><strong>Hoiku Colorを読み込んでいます</strong></div>}>
        {root}
      </Suspense>
      <MatchNavigationEnhancer />
      <ScoutNavigationEnhancer />
    </>
  </StrictMode>,
);
