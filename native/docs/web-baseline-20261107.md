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
