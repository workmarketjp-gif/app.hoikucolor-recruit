// Static integration guard. It supplements, but cannot replace, a real Expo
// screen test and authenticated save/readback on Android and iOS.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const screen = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/components/ApplicationDocumentsSection.tsx', import.meta.url), 'utf8');
const vault = readFileSync(new URL('../src/lib/documentVaultApi.ts', import.meta.url), 'utf8');
assert.match(screen, /import \{ ApplicationDocumentsSection \}/);
assert.match(screen, /<ApplicationDocumentsSection[\s\S]*applicationId=\{applicationId\}/);
assert.match(component, /usePinnedCandidateAction/);
assert.match(component, /listJobseekerDocuments\(pinned\.client\)/);
assert.match(component, /listSubmittedApplicationDocuments\(pinned\.client, applicationId\)/);
assert.match(component, /listApplicationDocumentExpectations\(pinned\.client, applicationId\)/);
assert.match(component, /attachJobseekerDocumentToApplication\(pinned\.client, document, applicationId\)/);
assert.match(component, /hasCanonicalApplicationAttachment\(applicationId, document\.id, submitted\)/);
assert.match(component, /setSnapshot\(null\); \/\/ Read failure after a write is ambiguous/);
assert.match(component, /createAttachedApplicationDocumentSignedUrl\(pinned\.client, document\)/);
assert.match(vault, /export async function createAttachedApplicationDocumentSignedUrl/);
assert.match(component, /onHandoffReadback\(handoff\)/);
assert.match(component, /application-documents-repair/);
console.log('Native application document Web integration wiring: 13 source assertions PASS (not device QA).');
