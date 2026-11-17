# COLOR Native r320 — application-document submission token recovery

- Scope: COLOR jobseeker Native only, ApplicationDocumentsSection.tsx; no Web/DB/RLS/Storage changes.
- Web baseline verified 2026-11-18: src/components/ApplicationMessages.tsx, main blob 6275c5e50c3f67eea58a2ecb53d6b984fd34a497, role jobseeker. Web supports document attachment, repair of missing documents, canonical reload and opening submitted copies. No live deployed or same-state Web capture performed.
- Native baseline: native/color-focused-document-refresh-r294-20261117 parent 6a48bb4d8cc812db7e3fd6fdc133510a96e4f710, component blob 21e44b095e2f429db0e7ec7daa51b3b791a876fa.
- Gap fixed: a Clerk token request which never settles prevented the attachment panel busy state from clearing. Use existing pinForApplicationMutation only BEFORE an attachment RPC, checking application/owner/presentation/foreground/App Lock/route lease before and after. A late token cannot trigger the first attachment.
- UX correctness: if authentication fails before the first attachment, explicitly say no document was submitted; preserve verified read-only rows but require refresh before another attempt. After any attachment is invoked, retain ambiguous-write warning and quarantine old snapshot. No retries or replacement of canonical APIs.
- Test source: native/qa/native-application-document-pin-deadline-r320.test.mjs (seven synthetic token/session scenarios) and native/qa/native-application-document-pin-wiring-r320.test.mjs (real UI-handler wiring).
- Android: NOT VERIFIED (no SDK/emulator). iOS: NOT VERIFIED (no Xcode/macOS/Simulator). No native render, Expo full typecheck, canonical write/readback or signed artifacts. Signing/distribution permissions unconfirmed.
- No Production/Store, automatic applications/messages, paid Actions/EAS, or real candidate data.
