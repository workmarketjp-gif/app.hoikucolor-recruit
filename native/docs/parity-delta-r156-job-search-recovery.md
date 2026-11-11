# r156 — 求人検索の失敗・該当0件からの復旧導線（Native）

- **Web基準**: `src/App.tsx` の `JobsView` / `InlineError` / `EmptyState`。Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`、確認日2026-11-11 NZ、求職者ロール、検索エラー／条件付き検索0件の合成状態。実ブラウザとNativeの同条件スクリーンショットは未取得。
- **実装所有者**: COLOR Native 専任。ブランチ `native/color-job-search-retry-empty-action-r156-20261111`、作業開始HEAD `211d676232eeb5427df3d60bdb335c2c71413b32` (r155)。開いているPRの競合0件を開始時に確認。共同DB/API/LP/他アプリは編集しない。
- **修正**: `native/src/app/(tabs)/jobs.tsx` の検索失敗表示に明示的な「再試行」ボタンを追加。現在のキーワード・絞り込みを維持して既存の正式 `searchJobseekerJobs` 経路を再実行する。二重操作回避のため loading 中は押せず、キーワードの遅延検索タイマーをキャンセルする。エラーを0件と誤認しない。
- **修正**: 真正の空結果かつ有効な検索条件がある場合、0件のカード内にもWeb相当の「条件をクリア」ボタンを表示。既存 `clearFilters` を再利用し、キーワード・所在地・雇用形態・実績条件を初期化して正式検索を再開。失敗中・読込中・条件なしでは表示しない。
- **データと認証**: `usePinnedCandidateAction`、求職者／セッション隔離、正式RPC・RLS、検索順位とブックマーク、採用権限、ランキング表示は既存実装を維持。実応募・実メッセージ・本番DB変更なし。
- **追加回帰検査**: `native/qa/native-job-search-recovery-actions-contract.mjs`。Web基準ソースとNative修正ソースをGitHubから再取得し、コミット済み契約本文をV8でファイル参照のみ仮想化して実行：PASS。これはNodeランナー・React Native画面レンダリング・API統合のPASSではない。既存CLIコンプリートタイプチェックは未実行。
- **CI/費用**: 対象ブランチのみ更新。 `.github/workflows/ci.yml` は main push／PR時に重いAndroid jobを起動するためPR作成とmain統合は保留。MCP/HelloWork の path-trigger への該当変更なし。追加有料Actions、EAS、API agent、Store、Productionなし。外部連携の自動build／請求総額は未確認。

| 対象状態（Web基準） | Nativeソース | Android実画面 | iOS実画面 | API連携実証 |
|---|---|---|---|---|
| 検索エラー → 同条件で再試行 | 実装・静的検査PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| 条件付き0件 → 条件クリア → 再検索 | 実装・静的検査PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| ローディング／通常成功／ページ送り | 既存処理を保持（今回は未変更） | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

**状態**: IMPLEMENTING。Expo依存関係を使ったフル型検査、Android SDK／エミュレーター、macOS／Xcode、実ログイン＋正式データの保存読戻し、署名／Android配布、iOS TestFlight／ad-hocの資格・配布権限は未確認／未実施。両OSの同条件レンダリング・キーボード・長文・小型端末・拡大文字・エラー／空結果まで検証し、受入用両OSビルドを揃えるまでは READY_FOR_MASA_ACCEPTANCE としない。

**次**: 正規Expo checkoutで追加Node契約を実行し型検査→実アプリで検索→求人詳細→お気に入り保存／一覧反映／解除を求職者合成アカウントで検証。承認なしにCIを起動しない。
