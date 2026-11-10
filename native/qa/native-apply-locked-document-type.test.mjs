import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveVaultUploadType } from '../src/lib/applyVaultSelection.ts';

test('embedded apply row uploads into its requirement category, even with a stale standalone picker', () => {
  assert.equal(resolveVaultUploadType(null, 'nursery_teacher_license', null, 'resume'), 'nursery_teacher_license');
  assert.equal(resolveVaultUploadType(null, 'work_history', 'resume', 'resume'), 'work_history');
});

test('standalone vault keeps editable category and explicit evidence shortcuts', () => {
  assert.equal(resolveVaultUploadType(null, null, null, 'cook_license'), 'cook_license');
  assert.equal(resolveVaultUploadType(null, null, 'assistant_nurse_license', 'resume'), 'assistant_nurse_license');
});

test('replacing an existing file retains its actual document category', () => {
  assert.equal(resolveVaultUploadType('registered_dietitian_license', null, 'resume', 'resume'), 'registered_dietitian_license');
  assert.equal(resolveVaultUploadType('nurse_license', 'resume', null, 'resume'), 'nurse_license');
});

test('actual Native apply panel fixes category to Web requirement row', () => {
  const parent = readFileSync(new URL('../src/components/ApplyDocumentsPanel.tsx', import.meta.url), 'utf8');
  const vault = readFileSync(new URL('../src/components/DocumentVaultSection.tsx', import.meta.url), 'utf8');
  assert.match(parent, /<DocumentVaultSection initialType=\{row.type\} lockedType=\{row.type\}/);
  assert.match(vault, /\{lockedType \? <View testID="document-vault-locked-type"/);
  assert.match(vault, /\{!lockedType && showTypes \? <View testID="document-vault-type-options"/);
  assert.match(vault, /resolveVaultUploadType\(replacement\?\.document_type \?\? null, lockedType, explicitType, documentType\)/);
  assert.match(vault, /resolveVaultUploadType\(replacement\?\.document_type \?\? null, lockedType, null, documentType\)/);
  assert.match(vault, /pickAndUpload\(null, lockedType \?\? "resume"\)/);
});
