import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { presentSavedJobSource } from '../src/lib/savedJobSourcePresentation.ts';

// This is a source wiring/logic contract, not a rendered Android or iOS test.
const detail = readFileSync(new URL('../src/app/job/[id].tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/components/ApplyDocumentsPanel.tsx', import.meta.url), 'utf8');

test('job detail uses the existing canonical external-source presentation', () => {
  assert.match(detail, /import \{ presentSavedJobSource \} from '\.\.\/\.\.\/lib\/savedJobSourcePresentation';/);
  assert.match(detail, /presentSavedJobSource\(job\)/);
  assert.match(detail, /sourcePresentation\.provenance/);
  assert.match(detail, /最終確認 \{sourcePresentation\.lastVerified\}/);
  assert.equal(presentSavedJobSource({
    is_external: true, source_name: 'ハローワーク', source_job_id: '12345-67890',
    source_last_verified_at: '2026-11-07T18:30:00Z',
  }).lastVerified, '2026年11月8日');
});

test('job detail never fabricates external verification for an internal job or invalid date', () => {
  assert.equal(presentSavedJobSource({
    is_external: false, source_name: 'ハローワーク', source_last_verified_at: '2026-11-07T18:30:00Z',
  }).lastVerified, null);
  assert.equal(presentSavedJobSource({
    is_external: true, source_name: 'ハローワーク', source_last_verified_at: '2026-02-30',
  }).lastVerified, null);
});

test('apply document filenames stay readable without a single-line cutoff', () => {
  assert.match(panel, /<Text style=\{styles\.optionText\}>/);
  assert.doesNotMatch(panel, /numberOfLines=\{1\} style=\{styles\.optionText\}/);
  assert.match(panel, /optionText: \{ fontSize: 15, lineHeight: 22, flexShrink: 1 \}/);
});

test('apply step distinguishes adding first file from choosing another and discloses upload limits', () => {
  assert.match(panel, /row\.candidates\.length \? '別のファイルを追加'/);
  assert.match(panel, /PDF・JPEG・PNG、1ファイル10MBまで。/);
  assert.match(panel, /isApplySubmissionUnavailable\(/);
  assert.match(panel, /assertCandidateDocumentListOwner\(/);
});
