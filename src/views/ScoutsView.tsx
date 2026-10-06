import { ProfileMatchingPreferencesPanel } from '../components/ProfileMatchingPreferencesPanel';
import { ScoutInbox } from '../components/ScoutInbox';
import { ScoutPrivacyPanel } from '../components/ScoutPrivacyPanel';

/** Anonymous scouts: the inbox first, then who may scout you and on which conditions. */
export function ScoutsView() {
  return (
    <div className="hc-view hc-scouts">
      <p className="hc-lead">匿名のまま園からのお誘いを確認できます。承諾するまで氏名・メール・電話番号は共有されません。</p>
      <ScoutInbox />
      <section id="scout-settings" tabIndex={-1} className="hc-section hc-scout-settings" aria-labelledby="scout-settings-heading">
        <div className="hc-section-head"><h2 id="scout-settings-heading">スカウト設定</h2></div>
        <p className="hc-note">公開範囲と希望条件を整えると、あなたに合う園からのお誘いにつながりやすくなります。</p>
        <ScoutPrivacyPanel />
        <ProfileMatchingPreferencesPanel />
      </section>
    </div>
  );
}
