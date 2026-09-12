import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './AppRoot';
import { ScoutRouteRoot } from './ScoutRouteRoot';
import { ScoutNavigationEnhancer } from './components/ScoutNavigationEnhancer';
import './styles.css';
import './verified-workplace.css';

const root = window.location.pathname.startsWith('/scouts') ? <ScoutRouteRoot /> : <AppRoot />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      {root}
      <ScoutNavigationEnhancer />
    </>
  </StrictMode>,
);
