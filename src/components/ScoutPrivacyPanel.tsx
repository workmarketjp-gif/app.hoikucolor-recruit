import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import {
  addScoutBlockedOrganization,
  getScoutPrivacySettings,
  removeScoutBlockedOrganization,
  searchScoutBlockableOrganizations,
  setScoutOptIn,
  type ScoutBlockableOrganization,
  type ScoutPrivacySettings,
} from '../lib/scoutPrivacyRepository';
import './ScoutPrivacyPanel.css';

export function ScoutPrivacyPanel() {
  const [settings, setSettings] = useState<ScoutPrivacySettings | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScoutBlockableOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setSettings(await getScoutPrivacySettings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'スカウト設定を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleScout = async () => {
    if (!settings || busy) return;
    const next = !settings.scout_opt_in;
    setBusy(true); setError(null); setNotice(null);
    try {
      await setScoutOptIn(next);
      setSettings({ ...settings, scout_opt_in: next });
      setNotice(next ? '匿名スカウトを受け取る設定にしました。' : '匿名スカウトを停止しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'スカウト設定を更新できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    const normalized = query.trim();
    setNotice(null); setError(null);
    if (normalized.length < 2) {
      setResults([]);
      setError('法人名を2文字以上入力してください。');
      return;
    }
    setSearching(true);
    try {
      setResults(await searchScoutBlockableOrganizations(normalized));
    } catch (err) {
      setError(err instanceof Error ? err.message : '法人を検索できませんでした。');
    } finally {
      setSearching(false);
    }
  };

  const addBlock = async (organization: ScoutBlockableOrganization) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await addScoutBlockedOrganization(organization.organization_id);
      await load();
      setResults((prev) => prev.filter((item) => item.organization_id !== organization.organization_id));
      setNotice(`${organization.organization_name}からプロフィールが見えないようにしました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ブロック設定を追加できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (organizationId: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await removeScoutBlockedOrganization(organizationId);
      await load();
      setNotice('手動ブロックを解除しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ブロック設定を解除できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return <section className="form-section scout-privacy-panel" aria-labelledby="scout-privacy-heading">
    <div className="form-section-head">
      <h3 id="scout-privacy-heading">匿名スカウト・公開範囲</h3>
      <p>応募前は氏名・メール・電話番号・現在の勤務先を園へ公開しません。希望条件や資格など、転職先選びに必要な情報だけを匿名で利用します。</p>
    </div>

    {loading ? <div className="empty-state"><p>スカウト設定を読み込んでいます。</p></div> : settings && <div className="scout-privacy-stack">
      <div className="scout-toggle-card">
        <div>
          <strong>匿名スカウトを受け取る</strong>
          <p>ONにすると、ブロックしていない園・法人から匿名プロフィールをもとに見学や応募のお誘いを受けられるようになります。</p>
        </div>
        <button type="button" className={`scout-toggle ${settings.scout_opt_in ? 'is-on' : ''}`} aria-pressed={settings.scout_opt_in} disabled={busy} onClick={() => void toggleScout()}>
          <span>{settings.scout_opt_in ? 'ON' : 'OFF'}</span><i aria-hidden="true" />
        </button>
      </div>

      <div className="scout-safety-note">
        <Icon name="shield" size={17} />
        <div><strong>本人情報は承認前に共有しません</strong><p>匿名プロフィールには氏名・フリガナ・メール・電話番号・Clerk ID・自己紹介文を含めません。現在の勤務先はHoiku Officeの在籍情報から自動でブロックします。</p></div>
      </div>

      <div className="scout-block-section">
        <div className="scout-block-head"><div><strong>勤務先・見られたくない法人</strong><p>現在の勤務先は自動非表示です。ほかにも見られたくない法人を追加できます。</p></div></div>

        {settings.automatic_blocks.length > 0 && <div className="scout-block-list">
          {settings.automatic_blocks.map((organization) => <div className="scout-block-row is-automatic" key={`auto-${organization.organization_id}`}>
            <div><strong>{organization.organization_name}</strong><small>現在の勤務先として自動ブロック</small></div><span>解除不可</span>
          </div>)}
        </div>}

        {settings.manual_blocks.length > 0 && <div className="scout-block-list">
          {settings.manual_blocks.map((organization) => <div className="scout-block-row" key={organization.organization_id}>
            <div><strong>{organization.organization_name}</strong><small>手動ブロック</small></div>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void removeBlock(organization.organization_id)}>解除</button>
          </div>)}
        </div>}

        <div className="scout-search-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} placeholder="法人名を2文字以上入力" aria-label="ブロックする法人を検索" />
          <button type="button" className="secondary-button" disabled={searching || busy} onClick={() => void search()}><Icon name="search" size={15} /> {searching ? '検索中…' : '検索'}</button>
        </div>

        {results.length > 0 && <div className="scout-search-results">
          {results.map((organization) => <div className="scout-search-result" key={organization.organization_id}><strong>{organization.organization_name}</strong><button type="button" disabled={busy} onClick={() => void addBlock(organization)}>ブロック</button></div>)}
        </div>}
      </div>
    </div>}

    {error && <span className="form-error">{error}</span>}
    {notice && <span className="form-success">{notice}</span>}
  </section>;
}
