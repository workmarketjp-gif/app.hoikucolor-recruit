// Test double for documentVaultApi: the journey suite controls vault contents and attach outcomes.
export const state = { documents: [], attachFail: new Set(), attached: [], expectations: [], submitted: [] };
export async function listJobseekerDocuments() { return state.documents; }
export async function attachJobseekerDocumentToApplication(_c, document, applicationId) {
  if (state.attachFail.has(document.id)) throw new Error('attach failed');
  state.attached.push([document.id, applicationId]);
  return { id: `att-${document.id}` };
}
export async function listApplicationDocumentExpectations() { return state.expectations; }
export async function listSubmittedApplicationDocuments() { return state.submitted; }
