import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const route=read('src/PrivateRecruitmentRoute.tsx'),ui=read('src/private-recruitment/PrivateRecruitmentTest.tsx'),repo=read('src/lib/documentVaultRepository.ts');

// The lane reuses the normal apply-documents step and vault; nothing is reimplemented.
assert.match(route,/<ApplyDocumentsStep key=\{job\.id\} jobId=\{job\.id\} loadRequirements=/);
assert.match(route,/submitDocuments=\{submit\}/);
assert.match(route,/normalizeRequirements\(job\.document_requirements\)/);
assert.match(route,/copyVaultDocumentToTestApplication\(source,d\.file_path\)/);
assert.match(route,/p_action:'document_attached'/);
assert.match(route,/documentStep=\{documentStep\} afterApply=\{afterApply\} renderDocuments=/);
assert.doesNotMatch(route+ui,/service_role|hc_jobseeker_submit_application|hc_register_jobseeker_document_attachment/);

// Copies only go to the lane's own prefix, through the existing retry-safe copy.
assert.match(repo,/export async function copyVaultDocumentToTestApplication[\s\S]*?startsWith\('recruitment-test\/'\)[\s\S]*?ensureApplicationCopy\(document\.file_path, destinationPath\)/);

// Shared UI: documents are optional hooks; without them the original apply form is unchanged.
assert.match(ui,/documentStep&&job\.accepting\?/);
assert.match(ui,/mutate\('apply',\{applicant_name:applicant,document_ids:ids\}\)/);
assert.match(ui,/mutate\('apply',\{applicant_name:applicant\}\)/);
assert.match(ui,/書類の提出を完了する/);
assert.match(ui,/この求人に必要な書類がそろっていません/);
assert.match(ui,/応募は届いています。書類の提出が完了していないため/);
console.log('PASS private recruitment documents contract: shared apply step, vault copy to lane prefix, retryable registration, unchanged form without documents');
