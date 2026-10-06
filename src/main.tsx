import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { AppLoading } from './components/AppLoading';
import './styles.css';
import './verified-workplace.css';
import './mobile-hardening.css';
import './candidate-shell.css';

// One app, one Clerk session, one router: every candidate screen (/, /jobs, /saved,
// /applications, /profile, /scouts, /visits, /spot-jobs, /matches, /compare) is a
// regular view of App. Nothing is injected into the page from outside React.
const AppRoot = lazy(() => import('./AppRoot').then((module) => ({ default: module.AppRoot })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<AppLoading />}>
      <AppRoot />
    </Suspense>
  </StrictMode>,
);
