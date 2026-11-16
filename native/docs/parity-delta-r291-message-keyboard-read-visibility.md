# r291 — 応募メッセージのキーボード表示中に未閲覧を誤って既読にしない

- 基準: 2026-11-16 NZ。Web求職者ルート `/application/:id` の園とのメッセージ（Web main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`、`src/components/ApplicationMessages.tsx`）。同一合成状態: 最新の園メッセージが通常の画面幅では見えるが、長文入力キーボードに覆われる状況。実Web/Native画面キャプチャではなくソース基準。
- 前回: Native r290 `74c31635b650d10772883e0bade8207e975b2766` はiOSの`automaticallyAdjustKeyboardInsets`とAndroidの`resize`を設定。一方、既読計算`candidateMessageReadVisibility`の高さはScrollView `onLayout`の高さで、iOSでキーボードインセットが変化すると必ずしも更新されない。**実端末での既読誤判定は未再現**だがソース上の潜在リスク。
- 対応: キーボード表示中は、測定値が古くても園メッセージの既読更新を開始しない。キーボード表示はiOS `keyboardWillShow` + 両OS `keyboardDidShow`、解除は`keyboardDidHide`で監視。初期状態は`Keyboard.isVisible()`。読取RPC開始前と非同期セッション確認後の両方で、既存可視領域計算をキーボード状態でゲート。画面アンマウント時にリスナーを解除し、キーボードが閉じた後は次の画面レイアウト/スクロールで通常の可視判定に復帰。
- 変更: `native/src/lib/candidateMessageReadVisibility.ts`、`native/src/app/application/[id].tsx`、`native/qa/native-message-keyboard-read-visibility-r291.test.mjs`、本台帳。バックエンド/RPC/認可/送信・保存・通知契約は変更なし。
- 検証: Node v22.16.0で実ソースヘルパーを`node --experimental-strip-types --test qa/native-message-keyboard-read-visibility-r291.test.mjs` 実行 **4/4 PASS**。`tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/candidateMessageReadVisibility.ts` **PASS**（対象ヘルパーのみ）。GitHub反映後の画面・ヘルパー・設定・テストのソース検査 **13/13 PASS**。検証したヘルパーGit blob `e2d0e45670fba5348a8304fc11e851b20289406e`、テストGit blob `b3ef3795fce8c537c78de055842b781db49cc514`。
- 対応行列: HC-COLOR-MSG-READ-KBD-01 Android：ソース実装・限定テスト済／実画面・キーボード・既読の正式RPC readback **未検証**。HC-COLOR-MSG-READ-KBD-02 iOS：ソース実装・限定テスト済／インセット、キーボード、既読正式RPC readback **未検証**。両方 `IMPLEMENTING`。
- 開発ゲート: Linux Node/npm/tscで限定実装テスト可能。Android SDK/エミュレーター、macOS/Xcode/iOS Simulatorなし。完全なExpo依存・正式合成候補テスト環境・両OS署名配布権限未確認。既読数・実画面・実機挙動を一切推測で完了扱いにしない。
- コスト/公開: 新しいCOLOR専用 `native/color-message-keyboard-read-visibility-r291-20261116` をr290 HEADから分岐。push対象はmainでもPRでもなく、既存ci.ymlはmain push / PRのみで起動。PR/main/Cloudflare/DB/RLS/Auth/Edge/Workers/本番未変更。有料Actions/EAS/外部開発セッションを起動しない。追加課金残枠不明。

状態: **IMPLEMENTING**。次は完全Expo型検査と両OSの同じ合成メッセージ状態でのキーボード被覆→既読維持→非被覆後の正式API readback、Web対比、署名済みビルドを優先。
