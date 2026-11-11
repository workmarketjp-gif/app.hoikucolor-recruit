# r159 — 比較表の勤務・会計実績を実値・種別に照合

- **範囲/所有者:** Color JOBSEEKER Nativeの園比較画面と専用共通表示処理/テストのみ。Native専用writer、基点 `c0cc318c768e4040f685cd237e0fd9c6d8529792` (r158)、ブランチ `native/color-compare-verified-evidence-r159-20261111`。本番・Webコード・DB/RLS/APIは未変更。作業開始時のopen PRは0件。root/nativeのAGENTS.mdは確認対象ディレクトリに存在せず、HQ #265 MINIMUM_COST_V1と#467を適用。
- **Web基準:** `src/views/CompareView.tsx` (main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, 2026-11-11、求職者、合成の通常値/件数のみ/出典不一致)。Web `verifiedMetricNode` は各metricを直接読むため、実績の表示可否はWeb担当の確認事項。公開画面の同条件キャプチャ・本番データ確認は未取得。
- **閉じたソース差分:** Native `compare.tsx` が `verified_workplace?.verified_metrics?.[key]` / `verified_finance?.verified_metrics?.[key]` を直接表示しており、ゼロのverified件数・異なるsource・不正なmetric値でも「勤務実績」「会計実績」として描画し得た。Native求人カード/詳細と同じ `verifiedEvidence` を共有し、実際に表示可能なmetricのみ値とラベルを出す。不適格は `実績未公開` として扱う。実際の本番で誤表示された証拠はない。
- **表示/操作:** 比較選択最大3件、既存マッチング、園掲載の給与・雇用条件、テーブルの順序、既存API・認証は保存。勤務と会計のsample sizeの単位を区別し、未確認件数を生成しない。次回は2OSの画面・正式API・Web同期検証。
- **テスト:** Node v22.16.0 `node --experimental-strip-types --test qa/native-comparison-verified-evidence.test.mjs` **5/5 PASS**（合成データで真正 `jobVerifiedEvidence.ts` を実行）。Git blob SHA: helper `95b45de69cf7715812cb67f2945451e5b8db43e4`、test `88d96198198ae0015ac1ac723ead58e48f8b6176`。一度helperの拡張子なしimportがNodeで解決不可となり、既存r158の `.ts` 実行方式へ修正して再実行PASS。既存 `test:comparison-private-readback` に追加。TypeScript/Expo全体検査、React Nativeレンダリング、正式RPC E2Eは**未実施**。
- **費用/公開:** branch-only、PR/main/Cloudflare/DB/Store/EAS/有料CIの起動なし。CIはmain pushとPRで起動するためPR作成せず。Cloudflare外部連携/課金残枠・署名/配布権限は未確認。

| シナリオ | 共通純処理 | Android実画面 | iOS実画面 | 正式API/Web再取得 |
| --- | --- | --- | --- | --- |
| 正しい勤務/会計実績とsample_count | Node PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| countのみ、異種source、無効な値 | Node PASS（実績未公開） | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| 比較選択2〜3件、給与と園掲載項目 | ソース既存維持・本run実行未検証 | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

**状態:** IMPLEMENTING。次の実装/QA: 現行Webの出典ポリシーをWeb ownerへ引継ぎ、求人検索→詳細→お気に入り保存/解除の正式 readback と比較における実績の同条件描画を開発者検証。実OS runner/安全な認証済み合成QAデータ/署名済み配布経路は外部blocker。READY_FOR_MASA_ACCEPTANCEではない。
