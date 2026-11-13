# COLOR Native r209 — manual scout refresh and organization search timeout (source-only)
Web baseline: main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6; authenticated jobseeker synthetic read-only refresh / organization block search.
Parent/source SHA: 438013469a0dca8a50ccb11a16a279587201ac18; original scouts.tsx blob d9f0078c3a34bcf5cd2b2633c6ecac14eef6ca37.
Issue: r208 bounded initial independent reads but manual inbox refresh and organization search each awaited candidate pin and canonical read with no deadline; a pending request could lock the relevant UI forever.
Correction: apply existing 15s boundedPrivateRead to pin and read-only canonical RPC in BOTH actions. Keep owner/session, generation, serial and App Lock gates; no auto retry, no synthetic empty results, no write path changes.
Local verification: Node v22.16.0; 15/15 real-helper Node tests PASS (r208+r209); helper-only strict tsc PASS. Native route is source-only; full Expo and actual device QA NOT performed.
Both OS: source only; no developer runtime/visual/API persistence evidence, no signed builds.
No branch/PR/main/CI/Cloudflare/Production, no actual candidate data, mutation or paid build.
Integration blockers: git HTTPS DNS from Linux; Expo dependencies unavailable; PR/main CI and Cloudflare Preview cost gates unverified. Next: complete Expo checkout/typecheck and both-OS synthetic QA.
