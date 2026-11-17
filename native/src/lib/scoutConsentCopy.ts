/**
 * Web-aligned, facility-specific disclosure before a Scout answer.
 * The decision still requires a separate user tap and server-side approval;
 * this text helper never starts a mutation or grants access to personal data.
 */
export function scoutConsentCopy(
  facilityName: string,
  decision: 'accepted' | 'declined',
): { title: string; message: string } | null {
  const name = facilityName.trim();
  if (!name || /[\u0000-\u001f\u007f]/.test(name)) return null;
  if (decision === 'accepted') {
    return {
      title: `${name}からのスカウトを承諾しますか？`,
      message: '承諾後は、園が今後の連絡に必要な氏名・メール・電話番号等を確認できるようになります。',
    };
  }
  return {
    title: `${name}からのスカウトを辞退しますか？`,
    message: '辞退した場合、氏名・連絡先は園へ共有されません。',
  };
}
