import { useEffect } from 'react';
import './RankingDisclosureEnhancer.css';

const disclosureId = 'hc-ranking-disclosure';
const badgeClass = 'hc-ranking-position';

function removeRankingUi() {
  document.getElementById(disclosureId)?.remove();
  document.querySelectorAll(`.${badgeClass}`).forEach((node) => node.remove());
}

function syncRankingUi() {
  if (!window.location.pathname.startsWith('/jobs')) {
    removeRankingUi();
    return;
  }

  const grid = document.querySelector<HTMLElement>('.job-grid');
  const searchPanel = document.querySelector<HTMLElement>('.search-panel');
  if (!grid || !searchPanel) return;

  let disclosure = document.getElementById(disclosureId);
  if (!disclosure) {
    disclosure = document.createElement('section');
    disclosure.id = disclosureId;
    disclosure.className = 'hc-ranking-disclosure';
    disclosure.setAttribute('role', 'note');
    disclosure.setAttribute('aria-label', '求人の表示順について');
    disclosure.innerHTML = `
      <div class="hc-ranking-disclosure-mark">表示順の基準</div>
      <div class="hc-ranking-disclosure-copy">
        <strong>情報公開を優先したオーガニック表示です</strong>
        <p>現在は有料の上位表示を適用していません。HO / HF Verified の品質ポイント、情報公開率、公開日時の順で表示します。園の申告内容を Verified 実績として扱うことはありません。</p>
        <small>検索で絞り込んだ場合の番号は、絞り込み後の表示順です。将来、有料枠を導入する場合は「PR」と明示し、オーガニック評価と分離します。</small>
      </div>`;
    searchPanel.parentElement?.insertBefore(disclosure, searchPanel);
  }

  const cards = Array.from(grid.querySelectorAll<HTMLElement>(':scope > .job-card'));
  cards.forEach((card, index) => {
    let badge = card.querySelector<HTMLElement>(`:scope > .${badgeClass}`);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = badgeClass;
      card.prepend(badge);
    }
    const position = index + 1;
    const label = `表示順 ${position}`;
    const ariaLabel = `検索結果の表示順 ${position}番目`;
    if (badge.textContent !== label) badge.textContent = label;
    if (badge.getAttribute('aria-label') !== ariaLabel) badge.setAttribute('aria-label', ariaLabel);
  });
}

export function RankingDisclosureEnhancer() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncRankingUi);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', schedule);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('popstate', schedule);
      removeRankingUi();
    };
  }, []);

  return null;
}
