# r292 — メッセージ送信中の画面離脱後、古い結果による重複送信を防ぐ

- **比較対象 / 合成状態**：2026-11-16 NZ。Web JOBSEEKER `/application/:id` の「園とのメッセージ」（Web main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, `src/components/ApplicationMessages.tsx`, blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`）とNative同一応募・合成メッセージ。Webの既存送信操作を維持し、バックエンドや許可を変更しない。
- **確認したソース上の欠陥**：Native r291 `992b690a7af7e57900d3db81a7d761150c61ad9b` では `sendApplicationMessageDurable` 呼出し後、画面フォーカス離脱などで `generation` が変わると結果を破棄する。しかし未確定送信記録は失敗ハンドラーで現行generationの時しか保存しておらず、正式API実行後にフォーカスが変化したケースで「同じ下書きを再送信可能」になり得る。実端末・実送信での再現ではない。
- **実装修正**：正式RPC開始直前の `onInvokeStarted` で、送信前メッセージID、本文、候補者、Clerk session、応募IDを画面ローカルのrefに保存。非同期結果が古くなってもrefを保持し、次回同画面復帰・画面内再読込時には「最新のメッセージを確認する」を表示。React state更新が遅れてもrefの存在で送信を同期的に拒否。正式な同一候補者・同一応募の再取得で新しいメッセージが確認される場合だけ既存レビュー処理が解除する。自動再送信しない。異なる候補者への転用も行わない。
- **変更ファイル**：`native/src/app/application/[id].tsx`, `native/src/lib/candidateMessageInvocationReview.ts`, `native/qa/native-message-invocation-blur-quarantine-r292.test.mjs`, 本台帳。
- **検証**：Node v22.16.0 `node --experimental-strip-types --test qa/native-message-invocation-blur-quarantine-r292.test.mjs` → **6/6 PASS**（独立ヘルパー実ソース）。対象ヘルパー `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/candidateMessageInvocationReview.ts` → PASS。r291の正確な既存blob（`e2d0e45670fba5348a8304fc11e851b20289406e`）に対するNode再実行 → 4/4 PASS。応募詳細TSXはGitHub取得実ソースからパッチ生成し、10件の結線ソース検査PASS。**React Nativeレンダリング、Expo全体型検査、正式RPC発信・保存再取得の実動作は未実施**。
- **Web-to-Android/iOS対応行列**：HC-COLOR-MSG-SEND-BLUR-01 Android＝ソース修正・純粋な関数テスト済／実端末での送信中離脱→復帰→正式readback未検証（IMPLEMENTING）。HC-COLOR-MSG-SEND-BLUR-02 iOS＝同じ状態（IMPLEMENTING）。合成データのみ、実候補者情報・送信なし。
- **所有・費用・リリース**：COLOR Native専用ブランチ `native/color-message-invocation-blur-quarantine-r292-20261116`、親 `992b690a7af7e57900d3db81a7d761150c61ad9b`。GitHub Actionsはmain push / PR起動設定、今回はどちらも使わない。Web/Hello Work/共有バックエンド/DB/RLS/Auth/Edge/Workers/Cloudflare/本番/Storeは変更なし。有料Actions/EAS/Codex/Work/Claudeなし。請求・署名・配布権限未確認。
- **次の実施**：Expoを依存込みで型検査できる正規環境での全体検査。Android/iOS実機またはシミュレーターで、送信中離脱・同一画面復帰・正式API readback・他候補者への切替・長文キーボードのWeb対比。署名済み受入ビルドは両OS未提供。

**状態：IMPLEMENTING。** 本実装とテストはNative実動作の受入を意味しない。
