import { useState } from 'react';
import { Icon } from './Icon';

/** How search results are ordered. Shown above the results on the job search screen. */
export function RankingDisclosure() {
  const [open, setOpen] = useState(false);
  return (
    <section className="hc-ranking-disclosure" role="note" aria-label="求人の表示順について">
      <button type="button" className="hc-ranking-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span><strong>表示順について</strong> 情報公開を優先したオーガニック表示です</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="hc-ranking-body">
          <p>現在は有料の上位表示を適用していません。HO / HF Verified の品質ポイント、情報公開率、公開日時の順で表示します。園の申告内容を Verified 実績として扱うことはありません。</p>
          <p>検索で絞り込んだ場合の番号は、絞り込み後の表示順です。Google求人などから特定求人を開いた場合は「指定求人」と明示します。将来、有料枠を導入する場合は「PR」と明示し、オーガニック評価と分離します。</p>
        </div>
      )}
    </section>
  );
}

/**
 * Position labels for a result list. The deep-linked job (if pinned to the top) is
 * labelled 「指定求人」 and does not consume an organic position.
 */
export function rankLabels(jobIds: string[], deepLinkedJobId: string | null) {
  let organicPosition = 0;
  return jobIds.map((jobId) => {
    if (deepLinkedJobId && jobId === deepLinkedJobId) {
      return { text: '指定求人', ariaLabel: 'Google求人などから指定された求人' };
    }
    organicPosition += 1;
    return { text: `表示順 ${organicPosition}`, ariaLabel: `検索結果の表示順 ${organicPosition}番目` };
  });
}
