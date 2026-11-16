/**
 * Do not start a candidate-private apply-sheet read after the view, owner,
 * authentication or document selection lease has been revoked.
 *
 * The extra deferred check is intentional: boundedPrivateRead schedules its
 * callback asynchronously, and a route/account transition can occur before
 * the actual RPC begins. It does not cancel an RPC already started; callers
 * still have to validate the lease again before presenting or submitting.
 */
export function withCurrentApplyDocumentReadLease<T>(
  isCurrent: () => boolean,
  read: () => Promise<T>,
): Promise<T> {
  if (!isCurrent()) {
    return Promise.reject(new Error('閲覧状態が変わったため応募書類の取得を中止しました。'));
  }
  return Promise.resolve().then(() => {
    if (!isCurrent()) throw new Error('閲覧状態が変わったため応募書類の取得を中止しました。');
    return read();
  });
}
