import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { AttentionSummaryEnhancer } from './components/AttentionSummaryEnhancer';
import { CompareNavigationEnhancer } from './components/CompareNavigationEnhancer';
import { ExternalJobReturnEnhancer } from './components/ExternalJobReturnEnhancer';
import { MatchNavigationEnhancer } from './components/MatchNavigationEnhancer';
import { RankingDisclosureEnhancer } from './components/RankingDisclosureEnhancer';
import { ScoutNavigationEnhancer } from './components/ScoutNavigationEnhancer';
import { SpotNavigationEnhancer } from './components/SpotNavigationEnhancer';
import './styles.css';
import './verified-workplace.css';
import './mobile-hardening.css';

const AppRoot = lazy(() => import('./AppRoot').then((module) => ({ default: module.AppRoot })));
const CompareRouteRoot = lazy(() => import('./CompareRouteRoot').then((module) => ({ default: module.CompareRouteRoot })));
const MatchRouteRoot = lazy(() => import('./MatchRouteRoot').then((module) => ({ default: module.MatchRouteRoot })));
const ScoutRouteRoot = lazy(() => import('./ScoutRouteRoot').then((module) => ({ default: module.ScoutRouteRoot })));
const SpotJobsRouteRoot = lazy(() => import('./SpotJobsRouteRoot').then((module) => ({ default: module.SpotJobsRouteRoot })));

const defaultRoot = window.location.pathname.startsWith('/scouts') ? <ScoutRouteRoot /> : <AppRoot />;
const spotRoot = window.location.pathname.startsWith('/spot-jobs') ? <SpotJobsRouteRoot /> : defaultRoot;
const matchedRoot = window.location.pathname.startsWith('/matches') ? <MatchRouteRoot /> : spotRoot;
const root = window.location.pathname.startsWith('/compare') ? <CompareRouteRoot /> : matchedRoot;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <Suspense fallback={<div className="centered-state"><span className="loading-ring" /><strong>Hoiku Colorを読み込んでいます</strong></div>}>
        {root}
      </Suspense>
      <ExternalJobReturnEnhancer />
      <MatchNavigationEnhancer />
      <CompareNavigationEnhancer />
      <ScoutNavigationEnhancer />
      <SpotNavigationEnhancer />
      <AttentionSummaryEnhancer />
      <RankingDisclosureEnhancer />
    </>
  </StrictMode>,
);
