import { useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics';
import { clearPendingHandoff, mergeHandoff, planHandoff, readPendingHandoff, type HandoffPlan, type PreferenceHandoff } from '../lib/preferenceHandoff';
import { getJobseekerMatchingPreferences, saveJobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import './PreferenceHandoffPrompt.css';

type State =
  | { kind: 'idle' }
  | { kind: 'ask'; handoff: PreferenceHandoff; plan: HandoffPlan }
  | { kind: 'saving'; handoff: PreferenceHandoff; plan: HandoffPlan }
  | { kind: 'error'; handoff: PreferenceHandoff; plan: HandoffPlan; message: string }
  | { kind: 'done'; plan: HandoffPlan };

/**
 * After login, offers to save the childcare values picked on hoikucolor.jp before
 * registering. Nothing is written without the candidate's explicit confirmation, and
 * saving only adds values (re-reading the latest preferences right before writing).
 */
export function PreferenceHandoffPrompt({ userKey, onNavigate }: { userKey: string; onNavigate: (target: string) => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const busy = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handoff = readPendingHandoff();
    if (!handoff) return;
    let active = true;
    getJobseekerMatchingPreferences()
      .then((current) => {
        if (!active) return;
        const plan = planHandoff(current, handoff);
        if (!plan.addValues.length && !plan.addPrefecture) {
          clearPendingHandoff(); // Everything is already saved; nothing to ask.
          return;
        }
        setState({ kind: 'ask', handoff, plan });
        track('hc_pref_handoff_shown', { value_count: plan.addValues.length, has_area: Boolean(plan.addPrefecture) });
      })
      // Keep the handoff: it is offered again on the next start once loading works.
      .catch(() => undefined);
    return () => { active = false; };
  }, [userKey]);

  useEffect(() => {
    if (state.kind === 'ask' || state.kind === 'done') primary.current?.focus();
  }, [state.kind]);

  if (state.kind === 'idle') return null;

  const save = async () => {
    if (busy.current || (state.kind !== 'ask' && state.kind !== 'error')) return;
    busy.current = true;
    const { handoff } = state;
    setState({ ...state, kind: 'saving' });
    try {
      const latest = await getJobseekerMatchingPreferences();
      const plan = planHandoff(latest, handoff);
      await saveJobseekerMatchingPreferences(mergeHandoff(latest, handoff));
      // Verify persistence by reading back before telling the candidate it is saved.
      const stored = await getJobseekerMatchingPreferences();
      const missing = handoff.childcareValues.filter((value) => !stored.childcare_values.includes(value));
      if (missing.length) throw new Error('保存内容を確認できませんでした。');
      clearPendingHandoff();
      track('hc_pref_handoff_saved', { value_count: plan.addValues.length, has_area: Boolean(plan.addPrefecture) });
      setState({ kind: 'done', plan });
    } catch {
      track('hc_pref_handoff_failed');
      setState({ kind: 'error', handoff, plan: state.plan, message: '保存できませんでした。通信状況を確認して、もう一度お試しください。' });
    } finally {
      busy.current = false;
    }
  };

  const decline = () => {
    if (busy.current) return;
    clearPendingHandoff();
    track('hc_pref_handoff_declined');
    setState({ kind: 'idle' });
  };

  const close = () => setState({ kind: 'idle' });

  return (
    <div className="hc-handoff-backdrop">
      <section className="hc-handoff" role="dialog" aria-modal="true" aria-labelledby="hc-handoff-title" aria-describedby="hc-handoff-desc">
        {state.kind === 'done' ? (
          <>
            <h2 id="hc-handoff-title">保育観を保存しました</h2>
            <p id="hc-handoff-desc">マッチ度の画面で、保存した保育観をもとに求人を確認できます。内容はマイページでいつでも変更できます。</p>
            <div className="hc-handoff-actions">
              <button ref={primary} type="button" className="primary-button" onClick={() => { close(); onNavigate('/matches'); }}>マッチ度を見る</button>
              <button type="button" className="secondary-button" onClick={close}>閉じる</button>
            </div>
          </>
        ) : (
          <>
            <p className="hc-handoff-kicker">ホームページで選んだ保育観</p>
            <h2 id="hc-handoff-title">この保育観をマイページに保存しますか？</h2>
            <p id="hc-handoff-desc">保存すると、保育観にもとづく「マッチ度」やスカウトの精度向上に使われます。すでに保存している内容はそのまま残ります。</p>
            <ul className="hc-handoff-list">
              {state.plan.addValues.map((value) => <li key={value}><span className="hc-handoff-tag">追加</span>{value}</li>)}
              {state.plan.addPrefecture && <li><span className="hc-handoff-tag">希望エリアに追加</span>{state.plan.addPrefecture}</li>}
            </ul>
            {state.plan.keptValues.length > 0 && <p className="hc-handoff-kept">保存済みの保育観（そのまま残ります）：{state.plan.keptValues.join('・')}</p>}
            {state.kind === 'error' && <p className="form-error" role="alert">{state.message}</p>}
            <div className="hc-handoff-actions">
              <button ref={primary} type="button" className="primary-button" disabled={state.kind === 'saving'} aria-busy={state.kind === 'saving'} onClick={() => void save()}>
                {state.kind === 'saving' ? '保存中…' : state.kind === 'error' ? 'もう一度保存する' : '保存する'}
              </button>
              <button type="button" className="secondary-button" disabled={state.kind === 'saving'} onClick={decline}>保存しない</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
