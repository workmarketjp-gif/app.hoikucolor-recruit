# Hoiku Color Native — CA-04 Document Camera Capture P0

## Gap closed in prepared source
CA-04 requires the existing applicant-document targets to work as a real mobile flow, including direct capture. The prepared Native vault previously allowed PDF/JPEG/PNG attachment only through the system document picker. It did not expose camera capture, camera permission recovery, or Android ImagePicker process-death cleanup.

## Prepared behavior
- `expo-image-picker` SDK 55 compatible `~55.0.24` is prepared; no build was started.
- Resume/work-history/licence/other image capture uses the rear camera and the same canonical Document Vault upload/register API as file attachment. No document business logic is duplicated.
- Camera permission is requested only when the user taps the camera CTA. A non-repromptable denial provides a Settings recovery action.
- Microphone permission is explicitly disabled because document capture does not need audio.
- The document type and Candidate owner are snapshotted before entering the OS camera. The returned temporary image uses the same generation/session quarantine and app-private cache registry as DocumentPicker.
- On Android, `ImagePicker.getPendingResultAsync()` is checked before Clerk/navigation mounts. A camera image returned from a previous JS process is deleted from the private cache rather than being guessed into a Candidate/type; the next authenticated vault view tells the user to retake the image.

## Formal physical-device evidence — BLOCKED
Prepared contracts are not physical-device evidence. Store/QA Gate must record:
1. iOS実機: camera permission allow → photograph nursery-teacher licence → upload → signed open → set default → application copy.
2. iOS実機: deny permission, deny permanently / Settings recovery, then allow and retry.
3. Android実機: same happy path and permanent-denial recovery.
4. Android実機 with Developer Options `Don't keep activities`: launch camera, capture, force MainActivity destruction, return/relaunch; stale capture is deleted and the UI explains that capture must be repeated.
5. A→B session switch while camera is open: A image never uploads or appears for B; returned cache is purged.
6. Background long enough to trigger App Lock while camera is open: return remains shielded; no upload starts before unlock/session freshness succeeds.
7. Camera-generated file >10 MB or malformed MIME/content is rejected by existing byte validation with no Storage/RPC mutation.

No App Store/Google Play submission, Preview/Development build, GitHub push/merge, Supabase write/migration, or Cloudflare/Vercel build/deploy is part of this prepared change.
