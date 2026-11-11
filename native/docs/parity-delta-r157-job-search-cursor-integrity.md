# r157 — 求人検索ページ送りの正式データ整合性（COLOR Native）

- 基点: `ad306288338023c111ba12381f596af41122bfcf`、既存r156ブランチから専任新規ブランチ `native/color-job-search-cursor-proof-r157-20261111`。
- Web正本: `src/App.tsx`、Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`、2026-11-11、求職者ロール。検索→一覧→追加ページの合成テスト状態。実画面・実APIの同条件実証ではない。
- 不足を確認した範囲: Native `verifiedJobSearchRows` はページ送り用 `published_at` が欠落・破損しても成功配列として受理し、`searchJobseekerJobs` が不正なnextCursorを作る可能性があった。また `has_more=true` と全件数到達の矛盾が通った。これはソース上の可能性であり、本番障害の発生事実ではない。
- 修正: 発行時刻は正式timestamp文字列または明示nullのみ許容し、欠落・不正型・不正日付を拒否する。ページ行数以上の残件がないのに `has_more=true` の矛盾も拒否する。正式RPC/認証/RLS/フィルタ/順位/求人データ自体は不変更。異常結果は既存失敗UIに流れ、0件成功へ偽装しない。
- 検証: Node 22.16.0 `node --experimental-strip-types --test qa/native-job-search-readback.test.mjs` 8/8 PASS。新しい失敗条件と既存回帰が同時に成立。 `tsc --noEmit --target es2022 --lib es2022,dom --module esnext --skipLibCheck src/lib/jobSearchReadback.ts` PASS（グローバルtsc 5.8.3による単独検査）。完全なExpo依存関係／Android・iOS runtimeの検証ではない。既存 `test:job-discovery-parity` に当該Nodeテストを登録。
- 連携・費用: リポジトリCIはmain push・PR時のみ。Cloudflareに接続された2アカウントのPagesプロジェクトはともに0（他接続／Workers自動公開は未確認）。PR・main・Production変更なし、追加有料Actions/EAS/ビルドなし。

| ケース | Nativeソース/限定テスト | Android実画面 | iOS実画面 | 正式API→Web往復 |
|---|---|---|---|---|
| 有効な時刻とnull発行日時の扱い | 実装・Node PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| 時刻欠落/破損でページ送りを確定しない | 実装・Node PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| 全件取得済みなのに次ページ有を誤表示しない | 実装・Node PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

状態: IMPLEMENTING。次は実行可能な正規Expo環境で統合型検査→検索/保存/解除の認証済みAPI再取得、Android/iOS別の実画面検証。署名済みAPK/iOS配布権限とMASA受入は未実施。
