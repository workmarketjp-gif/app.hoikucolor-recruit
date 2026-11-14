# r254 — Notification visit/interview focus identity integrity

State: IMPLEMENTING, source QA only. Web baseline: JOBSEEKER /visits and application interview notification display, src/components/NotificationCenter.tsx, main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6. Review 2026-11-15 NZ, synthetic candidate-owned valid/absent/malformed focus IDs. No real data or deployed capture.

Gap: Native passed unchecked visitId/jobId to /visits and silently dropped malformed present interviewId before mark-read. A malformed server-resolved route could acknowledge without focusing its intended record. The new helper permits genuinely absent optional IDs but rejects malformed PRESENT ones before the existing push/card mark-read RPC. Canonical backend ownership, message visibility deferral, permissions and navigation labels unchanged. This is a UI/adapter-side safety correction, not a new backend capability.

Source verification: reconstructed prior helper Git blob 986493bdb6aa4cbb9fd232c971142562fc7ce97b. Node v22.16.0 focused helper + r253 regression: 10/10 PASS. TypeScript v5.8.3 isolated strict helper check: PASS. Adapter wiring to be re-fetched/verified after commit. Full Expo SDK typecheck, canonical RPC readback, Android/iOS rendered UI/keyboard/accessibility and installable builds remain NOT VERIFIED.

| Synthetic Web-to-Native journey | Android | iOS |
| --- | --- | --- |
| Valid/absent optional focus | IMPLEMENTING (source only) | IMPLEMENTING (source only) |
| Malformed visit/job/interview focus rejected before mark-read | IMPLEMENTING (source only) | IMPLEMENTING (source only) |
| Real rendered/canonical API/signed acceptance | BLOCKED_EXTERNAL (SDK/emulator/signing) | BLOCKED_EXTERNAL (Xcode/simulator/distribution) |

Ownership: COLOR Native only; repo workmarketjp-gif/app.hoikucolor-recruit; branch native/color-jobseeker-integration-r216-20261114; parent fc9405b7d93d1163bf16db25128f97001ef74ac3. Open PR #113 unrelated Hello Work docs. GitHub Actions push main and PR only; Cloudflare Worker Build triggers for app-hoikucolor-recruit zero in both connected accounts as checked. No PR/main/production/DB/RLS/auth/Worker, paid Actions/EAS, external agents, or actual candidate actions. Billing and signing permissions unknown.
Next: real Expo full typecheck and side-by-side Android/iOS same-state notification navigation/readback, then signed builds.
