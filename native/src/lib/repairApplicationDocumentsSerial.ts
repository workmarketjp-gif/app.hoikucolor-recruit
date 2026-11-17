/**
 * Repair application attachments one at a time. A lost screen/session/deadline
 * lease must not launch another Storage/RPC operation, and an ambiguous write
 * failure must not lead to additional attempts in the same batch.
 * Missing vault sources are definite non-writes and may be counted, not retried.
 * Server RLS and the attachment adapter remain the authority.
 */
export async function repairApplicationDocumentsSerial<TDocument>(options: {
  missingSourceIds: readonly string[];
  documents: readonly TDocument[];
  getDocumentId: (document: TDocument) => string;
  canContinue: () => boolean;
  attach: (document: TDocument, canContinue: () => boolean) => Promise<unknown>;
}): Promise<{ failed: number }> {
  const assertCurrent = () => {
    if (!options.canContinue()) {
      throw new Error('応募書類の復旧結果を確認できませんでした。提出状況を再確認してください。');
    }
  };
  assertCurrent();
  const byId = new Map(options.documents.map((document) => [options.getDocumentId(document), document]));
  let failed = 0;
  for (const sourceId of [...new Set(options.missingSourceIds)]) {
    assertCurrent();
    const document = byId.get(sourceId);
    if (!document) {
      failed += 1;
      continue;
    }
    // The attachment adapter checks this same lease after each async stage.
    // Any failed/unknown acknowledgement stops the batch; do not continue.
    await options.attach(document, options.canContinue);
    assertCurrent();
  }
  return { failed };
}
