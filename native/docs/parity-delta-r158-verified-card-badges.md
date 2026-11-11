# r158 — 求人カードの「確認済み」実績表示を正式データに限定

- 対象: COLOR求職者Nativeの求人検索カードのみ。基点 `4148f0ef28248ca6dae3e240ebc86280c608b90e`。Web基準: `src/components/JobCard.tsx`, `src/App.tsx`, main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`、2026-11-11、求職者、実績0件／実績値欠落／正常値の合成状態。双方の実画面は未取得。
- 問題: 現Native求人検索カードと現Web JobCardは `verified_metric_count > 0` のみで実績バッジ表示可能。例えば件数だけ存在し、有効な metric label/value/source が空でも「✓勤務実績あり」を表示するソース上の可能性がある。本番発生は不明。すでにNative Saved/detail側は実値とsourceを検証。
- Native修正: 既存 `verifiedEvidence(..., 'workplace'|'finance')` と一致する場合のみバッジ表示する。正式RPCレスポンス由来の許可された指標と対応sourceを要求。給与、求人条件、ランキング、保存/応募API、RLS、ブラウザ遷移は変更しない。Webとの表示差分はWeb担当確認事項とし、Webソースは編集しない。
- テスト: `node --experimental-strip-types --test qa/native-job-search-card-web-presentation.test.mjs` 7/7 PASS（真正実ソース、合成データ）、r157の検索行検査8/8 PASS、合計15/15。同じGitHub blob SHAでソース/テストの保存照合。Expo全体型検査／RNレンダリング／認証済API照合は未実施。
- 費用: PRおよびmain未更新、CI・EAS・Store・本番未起動。Cloudflare Workers／署名・配布権限／追加課金の全容は未確認。

| 状態 | Native純処理 | Android実画面 | iOS実画面 | Web/正式データ往復 |
|---|---|---|---|---|
| 正常なHO/HF実績値 | Node PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| countのみ/誤source/空の実績値 | バッジ非表示 Node PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| エラー・募集終了・通常メタ表示 | 既存テスト範囲PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

状態: IMPLEMENTING。次はWeb担当と正式ソース契約（countと実体の不変条件）を確認し、Native/Android/iOSの実際のレンダリング、保護された応募・お気に入りのAPI保存再取得を検証する。実行できるExpo依存関係と両OS runner、署名済みインストール経路が必要。