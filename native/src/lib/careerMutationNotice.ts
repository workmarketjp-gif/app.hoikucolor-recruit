/**
 * A canonical save/delete may complete after a candidate edits the form again.
 * A successful RPC readback then proves the submitted snapshot, NOT the newer
 * visible draft. Never tell the candidate their latest edits were saved.
 */
export type CareerMutationKind = 'salary' | 'conditions' | 'delete';

export function careerMutationNotice(
  kind: CareerMutationKind,
  submittedRevision: number,
  currentRevision: number,
): string {
  if (submittedRevision !== currentRevision) {
    return kind === 'delete'
      ? '削除中に入力が変わりました。保存条件は削除されましたが、現在の入力は未保存です。'
      : '保存中に入力が変わりました。現在の入力は未保存です。再度内容をご確認ください。';
  }
  if (kind === 'salary') return 'この金額を保存しました。あなただけが見られます。';
  if (kind === 'conditions') return '条件を保存しました。あなただけが見られます。';
  return '保存した条件を削除しました。';
}
