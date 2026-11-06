# Web baseline check — 2026-11-07

Method: source comparison only (`git show origin/main:src/components/CandidateShell.tsx` against `native/src/app`).
No deployed-Web screenshots, no signed-in session, no device. This is NOT visual parity evidence.

- Web `origin/main`: `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6` (unchanged since the ledger's reference SHA).
- Native source: branch `native/color-jobseeker-consolidation-20261107` (r49 + fixes).
- Role/data: authenticated jobseeker; synthetic data only.

## Navigation

| Item | Web (`shellTabs`) | Native (`(tabs)/_layout.tsx`) | Result |
| --- | --- | --- | --- |
| Bottom tabs, in order | ホーム / 求人を探す / お給料 / 気になる / マイページ | same five, same order, icons home/search/yen/heart/user | MATCH |
| 応募管理 | secondary link; Home to-do and マイページ | hidden tab (`href: null`); pushed from Home and Profile | MATCH (entry points) |
| メッセージ | secondary link; Home to-do and マイページ | `/messages`, pushed from Home and Profile | MATCH (entry points) |
| スカウト, 見学・体験, スポット勤務, マッチ度, 園を比較 | secondary links | `/scouts`, `/visits`, `/spot-jobs`, `/matches`, `/compare` pushed from Profile (spot-jobs, matches also Home) | MATCH (entry points) |
| 通知 | header bell | hidden `notifications` tab | MATCH (entry point) |
| Unread badge on マイページ | `badges.profile` | not checked | UNVERIFIED |
| Sign-out confirm text | `Hoiku Colorからログアウトしますか？` | not checked | UNVERIFIED |

## Not established by this check
Colours, typography, spacing, card layouts, salary/career presentation, resume layouts and photo/PDF specification
(600x800 is still unverified against Web), loading/empty/error states, large-text behaviour. These need same-state
Web captures and Native renders on Android and iOS.

## Resume photo specification (Web main fa779e7, source: `src/lib/resumePhotoStore.ts`, `src/lib/resumePdf.ts`)

| Rule | Web | Native (r49 + fixes) | Result |
| --- | --- | --- | --- |
| Storage | Device-local only (IndexedDB, keyed by owner); never uploaded by itself; drawn only into the PDF the candidate creates | Cache record per owner, purged on logout/account switch (r42) | Same intent; verify purge on device |
| Accepted input | JPEG/PNG (also webp/heic by type or extension); error text `写真はJPEGまたはPNGの画像を選んでください。` | Sanitizer; 10 MB cap | Cap is Native-only; Web has no explicit cap |
| Aspect | Center-crop to 3:4 | Picker `aspect: [3, 4]` + CSS `object-fit: cover` in a 30x40mm box | Visually equivalent in PDF; crop UI differs |
| Pixel size | **Re-encoded to 600x800 JPEG, quality 0.88** | **No resize/re-encode.** Metadata-stripped original is embedded (preview file states it is NOT equivalent to 600x800) | **GAP** |
| Background | White fill under the image (transparent PNG becomes white) | Not done | **GAP** (transparent PNG would render with page/box background) |
| EXIF/GPS | Dropped by canvas re-encode | Stripped by custom sanitizer (unit-tested) | OK in tests; unproven on-device |
| PDF placement | 30 mm x 40 mm box at top right, `縦40mm × 横30mm` placeholder | 30mm x 40mm `.photo` box, `写真` placeholder | Size MATCH; placeholder wording differs |
| PDF size impact | ~600x800 JPEG keeps PDF small | Up to 10 MB original embedded | Risk: oversized PDFs/vault upload |

Conclusion: 600x800 is confirmed as the current Web specification, and Native does not yet meet it. Closing the gap needs an
on-device resize + JPEG re-encode (3:4 cover crop, white background, q0.88). `expo-image-manipulator` is not currently a
dependency, so adding it is a dependency change that needs your approval and an Expo SDK 55 compatibility check.
