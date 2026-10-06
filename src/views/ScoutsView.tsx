import { ProfileMatchingPreferencesPanel } from '../components/ProfileMatchingPreferencesPanel';
import { ScoutInbox } from '../components/ScoutInbox';
import { ScoutPrivacyPanel } from '../components/ScoutPrivacyPanel';

/** Anonymous scouts: the inbox first, then who may scout you and on which conditions. */
export function ScoutsView() {
  return (
    <div className="hc-view hc-scouts">
      <ScoutInbox />
      <section id="scout-settings" tabIndex={-1} className="hc-section hc-scout-settings" aria-labelledby="scout-settings-heading">
        <div className="hc-section-head"><h2 id="scout-settings-heading">スカウト設定</h2></div>
        <ScoutPrivacyPanel />
        <ProfileMatchingPreferencesPanel />
      </section>
    </div>
  );
}
