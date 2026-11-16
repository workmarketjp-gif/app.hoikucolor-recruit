# r293 — 応募詳細の園メッセージをフォーカス中に正式APIで再取得する

- **比較基準（実ソース）**：2026-11-17 NZ。JOBSEEKER Web `/application/:id` のメッセージ領域、main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`、`src/components/ApplicationMessages.tsx` blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`。合成の求職者・園・送受信スレッド。Webはメッセージ領域を開いている場合、画面が表示中に60秒ごと／フォーカス復帰時に正式メッセージを再取得する。
- **不足したユーザーフロー**：Native r292 は同一画面を開き続けても新着の園メッセージを正式APIから定期再取得せず、画面離脱／手動リロードが必要だった。WebとNativeの行動差分（ソースで確認、実端末未再現）。
- **今回の実装**：Native `/application/[id]` がフォーカス中かつOSがactiveの間だけ60秒ごとに `listApplicationMessages` を再取得。バックグラウンドからのactive復帰時も更新。既存の候補者・Clerk session固定 `pinCandidateForRead` を使用し、RPCは `boundedPrivateRead` による最大15秒の表示期限を持つ。画面離脱時はtimerとAppStateリスナーを破棄。取得失敗は「未確認」とし、既存会話を空配列で置換しない。メッセージ入力中の下書きは消去しない。送信・面接/内定等の変更中、初回全体読み込み中、未確定送信レビュー中は自動取得を停止する。開始済み取得の後から送信/判断が確定しても、mutation revision一致チェックで古い会話スナップショットを破棄する。自動送信・既読の強制・API/RLS変更なし。
- **変更ファイル**：`native/src/app/application/[id].tsx`, `native/src/lib/focusedCandidateMessageRefresh.ts`, `native/qa/native-focused-message-refresh-r293.test.mjs`, 本台帳。
- **テスト（実行済み）**：Node v22.16.0 `node --experimental-strip-types --test qa/native-message-invocation-blur-quarantine-r292.test.mjs qa/native-focused-message-refresh-r293.test.mjs` → 15/15 PASS（今回9、関連r292 6）。`tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/focusedCandidateMessageRefresh.ts` → PASS。GitHub blobとローカル実テスト対象のSHA一致（helper `ac45e95a127d38c088708477078da2851e7b0829`, test `e3b8bb7293b45084d3168e583e14d3afc78f4c6f`）。GitHub上のWeb・Native実ファイルの結線静的確認14/14。これはReact Native実行／Expo全体型検査の代わりではない。
- **Web-to-Android/iOS行列**：`HC-COLOR-MSG-FOREGROUND-01` Android＝正式APIリフレッシュのソース実装、条件関数テスト済、Android実画面・バックグラウンド復帰・真正な保存readback **未検証**（IMPLEMENTING）。`HC-COLOR-MSG-FOREGROUND-02` iOS＝同じソース検証済、iOSシミュレータ/実機 **未検証**（IMPLEMENTING）。長文日本語、キーボード、画面端、再認証、通知と既読のOS差も未検証。合成情報のみ。
- **所有/許可/費用**：COLOR Nativeのみ。`native/color-focused-message-refresh-r293-20261117`、基点 `9c2209871b47d40d61ff55cd8dec6263be880246`。独立ブランチ、main/PR/本番/DB/RLS/Auth/Edge/Workers/Store不変更。Cloudflare Pages接続中2アカウントのプロジェクト一覧は空。Workersのビルド連携と課金枠は不明。追加有料Actions/EAS/Codex/Work/Claudeなし。
- **受入残**：完全な依存環境でExpo型検査→Android/iOS実画面比較→同一合成セッションで園の新着・送信中のpoll競合・background/foreground・失敗復帰・既読を実APIで検証。各OSの署名と配布経路は未確定、候補ビルドなし。次は応募検索→詳細→応募管理→メッセージ間の通し検証を優先。

**状態：IMPLEMENTING。** Developer Native QAと署名済み両OS受入ビルドは未完了。
