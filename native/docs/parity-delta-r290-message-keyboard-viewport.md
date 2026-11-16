# r290 — 応募先メッセージ：キーボード時の入力欄とスクロール

- **日付**: 2026-11-16 NZ。対象: 求職者が応募詳細の園とのメッセージ欄で日本語の長文を編集中（合成状態、個人情報なし）
- **Web基準**: main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`、`src/components/ApplicationMessages.tsx`（応募詳細→園とのメッセージ）。Webブラウザーの通常のフォーカス・入力動作。r289と同じ基準
- **Native**: r289 `f0782a8ff65d790550d523deba8f548381e901b7` → COLOR専用 `native/color-application-message-keyboard-r290-20261116`。変更対象 `native/src/app/application/[id].tsx`, `native/app.json`
- **確認できたソース差分**: 応募詳細の長い `ScrollView` に iOS 用 `automaticallyAdjustKeyboardInsets` がなく、Android は既定 resize だったが明示設定なし。これまでキーボード表示時に送信操作が表示できる保証はなかった（実機での再現は未確認）
- **修正**: iOSでScrollViewのキーボードインセット自動調整を有効化し、ドラッグでキーボードを閉じられるようにする。AndroidはExpo公式で規定された `softwareKeyboardLayoutMode: resize` を明記。既存のメッセージ4000字上限・正式API送信・再取得・未読判定・安全なセッションフェンスは変更しない
- **対応表**: HC-COLOR-MSG-KBD-01 iOSスクロール可能領域＝実装済、実画面未検証／HC-COLOR-MSG-KBD-02 Androidリサイズ構成＝設定済、prebuild・実画面未検証／HC-COLOR-MSG-KBD-03 入力・送信継続＝ソース結線のみ検証、正式APIと両OSは未検証
- **追加回帰**: `native/qa/native-application-message-keyboard-r290.test.mjs`（実ソース・設定ファイルのNodeテスト）。ソース照合はGitHub上の取得内容で実施し、Node完全チェックアウトでの新規テスト実行・Expo全体型検査は未実施
- **環境／受入条件**: Android SDK/エミュレーターとmacOS/Xcode・iOS Simulatorがない。署名済みAndroid APKとiOS TestFlight/ad-hoc配布権限は未確認。iOSのキーボード・safe area・長文・文字拡大、AndroidのwindowSoftInputModeとスクロールを実際のビルドで検証するまで完了扱いにしない
- **CI/費用**: Native/QA/docs/app.json の開発ブランチpushは既存のGitHub workflow実行対象外と検証。PR作成・main・Workers・本番・DB・RLS変更なし。追加有料Actions/EAS実行なし、課金枠未確認

**状態: IMPLEMENTING**。次はExpo完全型検査が利用できる環境で実行し、iOS/Android実画面のキーボードと入力／長文動作、正式API保存→再取得、署名配布を確認する。
