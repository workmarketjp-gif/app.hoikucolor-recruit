import logoMark from '../logo/logom_hoikucolor.png';
import { useDelayed } from './StateViews';

/**
 * App-level wait (Clerk / config). Shows nothing for the first 400ms so fast
 * starts never flash, then only a small mark + spinner — no explanatory copy.
 */
export function AppLoading() {
  const visible = useDelayed(400);
  return (
    <main className="hc-app-loading" aria-busy="true" aria-label="読み込み中">
      {visible && <><img src={logoMark} alt="" aria-hidden="true" /><span className="hc-spinner" /></>}
    </main>
  );
}
