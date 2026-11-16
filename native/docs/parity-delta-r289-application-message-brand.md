# r289 — 応募詳細／メッセージのブランド・可読性（ソース差分）

- **比較日**: 2026-11-16 NZ、求職者の合成QA状態（本人の応募にひもづく園メッセージと入力中の下書き。実個人情報不使用）
- **Web正本**: `main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`。応募管理→応募詳細→園とのメッセージ。参照: `src/components/ApplicationMessages.tsx`, `src/views/views.css:156-169`, `src/candidate-shell.css:13-17,203-204`
- **Native**: `native/src/app/application/[id].tsx`。対象OSは共通React Nativeコード（Android/iOSの描画結果は未検証）
- **所有**: Color求職者Native UI限定。新規専用branch `native/color-application-message-visual-parity-r289-20261116`、基点 `371e30d4c9c9f5ad93a53b233bb4c305a32f8e5e`（r288）。Staff/Family、Web、採用管理、共通API、DB、RLS、Workersには変更なし

## Web→Native差分と今回の改修

| ID / 対象 | Web正本 | Android / iOS 共通ソース改修 | OS実描画と正規API再読込 |
|---|---|---|---|
| HC-COLOR-MSG-UI-01 送信／応募詳細ボタン | Pink `#fb2f52` family、最小52px、高可読ラベル | 黒 `#191c20` のボタンを `#fb2f52`・最小52・角丸14・16pt文字へ | **両OS未検証** |
| HC-COLOR-MSG-UI-02 自分のメッセージ | `--hc-accent-soft #fff0f3` | 青 `#edf4ff` をピンク `#fff0f3` へ | **両OS未検証** |
| HC-COLOR-MSG-UI-03 園のメッセージ | 白＋細枠、15px本文・14px日時 | グレー塗りを白＋枠に変更。本文15、日時14、役割14 | **両OS未検証** |
| HC-COLOR-MSG-UI-04 入力欄と焦点 | 入力欄最低96px、ピンク識別 | メッセージ入力欄のみ最低96、焦点枠とラベルをブランド色へ。4000字制限は維持 | **両OS未検証** |

React NativeでWebのCSSグラデーションを再利用できないため、ベタ塗りのブランドピンクを採用。OS固有のキーボード・safe area・アクセシブル文字拡大は画面で比較するまでは未承認差分。

## 検証と制限

- **実ソース比較**：GitHub上の現行Native `[id].tsx` とWeb `views.css`・`candidate-shell.css` を読み込み、ブランドCTA、最低高さ、送受信バブル、文字サイズ、入力欄、フォーカス表示、durable送信配線を照合。8/8の条件が真（connected GitHub source / V8実行）。これは画面レンダリングではない
- **永続QA**：`native/qa/native-application-message-web-visual-r289.test.mjs` を追加。Nodeの完全Native checkoutで `cd native && node --test qa/native-application-message-web-visual-r289.test.mjs` を実行する。**この新規テスト自体は当runのローカル完全ソースで未実行**
- **前回互換検査**：r288の同一ファイルを含まないメッセージ失敗表示ヘルパーをローカルNode v22.16.0で `node --experimental-strip-types --test qa/native-application-failure-privacy-r288.test.mjs` → 10/10 PASS。ただしr289変更画面のテスト結果ではない
- **未検証**：Expo全体型検査、Android SDK/エミュレーター、iOS Xcode/Simulator、実機、Web同一データの並列キャプチャ、正規API保存→再取得、署名済Android APKとiOS TestFlight/ad-hoc権限
- **CI/費用**：`.github/workflows/ci.yml` はmain push/PR起動、その他3 workflowのbranch pushはNative/QA/Docs対象外。PRは作らずmainにも未反映。Cloudflare自動連携と課金枠は未独立確認。有料CI/EAS/他実行主体は起動しない

**State: IMPLEMENTING.** 次工程は応募詳細のWeb/Android/iOS実画面比較（小画面、長文、200%文字、キーボード、エラー）と求人検索→応募→メッセージの正規API通し検証。実装範囲はWebの既存メッセージUIに限定し、アプリ署名やMASA受入を捏造しない。
