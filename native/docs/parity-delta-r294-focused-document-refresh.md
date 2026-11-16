# r294 — 応募詳細の書類パネルをWebと同じ表示中に更新

- 比較基準：JOBSEEKER Web /application/:id の ApplicationMessages 書類タブ。main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59、src/components/ApplicationMessages.tsx blob 6275c5e50c3f67eea58a2ecb53d6b984fd34a497。参照2026-11-17 NZ、合成した求職者・園・応募・保存書類状態。
- 差分：r293までのNativeではメッセージのみ60秒更新され、書類パネルの保存済み/提出済み/期待書類は開いた時と手動更新時にしか正式データを再取得しない。一方、Webはパネルを開いている間、60秒・表示復帰時に3領域を読み直す。
- 今回：Native ApplicationDocumentsSectionが開いている間のみ60秒/OS active復帰時に既存のcanonical readApplicationDocumentSnapshotを実行。Clerk owner/session、App Lock、private-screen focus、document mutation、readPending、requestVersionを確認。閉じる/blur/所有者変更後の遅着を拒否。静かな更新中は前回確認行を表示しつつ書類操作を停止し、失敗時も旧行を保持するが提出/開く操作は再確認までブロック。自動再提出/実データ変更なし。
- Web-to-OS matrix: HC-COLOR-APP-DOC-FOREGROUND-01 Android: ソース実装 + 純粋関数Node回帰のみ。Androidレンダー/実API確認なし（IMPLEMENTING）。 HC-COLOR-APP-DOC-FOREGROUND-02 iOS: 同じソース、iOSレンダー/実APIなし（IMPLEMENTING）。データ readback、空/エラー/キーボード/文字サイズ/安全領域は未検証。
- Ownership: workmarketjp-gif/app.hoikucolor-recruit, native/color-focused-document-refresh-r294-20261117、基点 b48e19aec60d1c397e114b3779d619f8fe136f01。触れるのはNative書類UI、専用helper・QAとこの台帳のみ。既存PRなし。Web/Main/Auth/DB/RLS/Edge/Workers/Store無変更。
- テスト：Node v22.16.0 にて node --experimental-strip-types --test qa/native-focused-application-documents-refresh-r294.test.mjs qa/native-focused-message-refresh-r293.test.mjs → 15/15 PASS（新規6、r293の9）。tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/focusedApplicationDocumentsRefresh.ts → PASS。React Native/Expo全体・SDKテスト未実施。
- リリース・費用：GitHub CIはpush:main、PRのみ。新規PRなし。Cloudflare接続2アカウントのPages一覧は空、Workers Git build triggerは独立確認できず。追加有料Actions/EAS/外部開発なし。Android SDK/emulator・macOS/Xcode・署名/配布権限なし。
- 次：Web/Native合成書類の正式API往復を両OSで確認し、検索→応募→メッセージ/書類の連続E2Eと実画面対比、署名ビルド。
状態：IMPLEMENTING。READY_FOR_MASA_ACCEPTANCE ではない。
