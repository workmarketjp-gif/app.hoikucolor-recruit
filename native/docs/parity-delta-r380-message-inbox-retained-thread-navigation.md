# COLOR Native r380 — Web-equivalent retained message thread navigation

## Reference and single-writer provenance
- Web baseline (2026-11-20 Pacific/Auckland): `/messages`, `src/App.tsx` on main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, blob `21bbe8abf51ceee657266ff286593c8af784f399`, `MessagesView` lines 607–663. Role: synthetic signed-in candidate A, previously confirmed application conversations, manual index read pending/failing. Web renders href-enabled retained application rows irrespective of `applications.status`; the application detail re-reads canonical data. Deployed SHA, paired captured Web UI and Native renders: NOT VERIFIED.
- Native parent r379 `a60c3eeaa6c9737074278bd22e8b779e8708181b`; isolated branch `native/color-message-inbox-retained-thread-nav-r380-20261120`. Open PRs: zero at branch start. No root/native AGENTS.md. Ownership is COLOR Native message UI, its dedicated policy and tests only. No backend, Staff, Family, Web, public SEO, recruitment-admin, RLS or Worker changes.
- HQ #265 MINIMUM_COST_V1 / #467 authority checked. GitHub `.github/workflows/ci.yml` runs on main push / pull_request, not isolated branch push. Cloudflare build trigger was positively found for Worker `app-hoikucolor-recruit`, with `branch_includes: [main]` (not "zero triggers"). Branch-only push was therefore used without PR/main/Cloudflare deploy. This supersedes earlier inaccurate reports of zero Cloudflare triggers; no charge or quota claim.

## Closed source gap and preserved authorization
- Before: although the manual same-session refresh deliberately retained the verified conversation rows, Native disabled opening them while refreshing or after a failed read. The Web keeps those rows navigable.
- Now: verified same candidate+Clerk-session rows may navigate while a manual refresh is in flight or failed. A still-current snapshot is required; a first-load/error-without-verified-rows, focus re-entry, App Lock/background, logout, account/session switch, concurrent navigation or unknown application ID cannot open a stale conversation. The screen still pins the current Clerk session immediately before routing to `/application/[id]?focus=messages`, where canonical application authorization/readback runs. No messages sent, no invented unread state and no unauthorised data re-use.
- The retained-row notice now states that the detail will revalidate current information, rather than incorrectly claiming the row cannot be opened. Existing r379 application-list changes and other earlier fixes remain intact.
- Files: `native/src/app/messages.tsx`, `native/src/lib/messageInboxRefreshPolicy.ts`, `native/qa/native-message-inbox-manual-refresh-r222.test.mjs` (old conflicting assertion updated, not suppressed), `native/qa/native-message-inbox-retained-navigation-r380.test.mjs`.

## Exact local and source-linked evidence
- Linux Node v22.16.0: `node --experimental-strip-types --test qa/native-message-inbox-manual-refresh-r222.test.mjs qa/native-message-inbox-retained-navigation-r380.test.mjs` = **12/12 PASS**.
- TypeScript v5.8.3: `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler src/lib/messageInboxRefreshPolicy.ts` = **PASS**, helper only. Git blob identities of all three local tested files matched the uploaded branch versions exactly.
- GitHub real screen wiring checks: 9/9 PASS (current owner, retained view, selected UUID, pinned session before push, canonical index load, invalidation on focus, single flight, accessibility text). Static inspection only, not rendered app testing.
- Android: shared UI source implemented; SDK/adb/emulator unavailable, app typecheck/runtime/paired visual and synthetic canonical E2E NOT VERIFIED.
- iOS: shared UI source implemented; macOS/Xcode/simulator/signing route unavailable, app typecheck/runtime/paired visual and synthetic canonical E2E NOT VERIFIED.
- Expo/React Native/Clerk dependencies absent in this isolated runtime: full-app TypeScript and device runtime cannot be claimed. Existing source-level checks are not developer acceptance.

## Next and release gate
- Next highest-value independent workflow: `search → saved → apply → applications → messages` with synthetic candidate canonical save/readback/Web correspondence; alongside full Expo typecheck and real Android/iOS visual/accessibility QA once genuine dependencies and OS runners exist. Do not invent data.
- No PR, main merge, paid Actions/EAS, production DB/Workers change, Store publication, actual application/message or tester invite. Exact billing/quota/signing/distribution availability unknown.
- State: `IMPLEMENTING`, not `DEVELOPER_VERIFIED` across both OS and not `READY_FOR_MASA_ACCEPTANCE`.
