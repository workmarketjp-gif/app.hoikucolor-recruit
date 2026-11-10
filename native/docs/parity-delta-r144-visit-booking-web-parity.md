# Hoiku Color Native r144 — 見学・体験予約フォームのWeb準拠（2026-11-11 NZ）

## 基準と所有権
- Web: `main` `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/VisitTrialPanel.tsx` blob `590bb872472311c3be3112625bff5f3969af2edf`. URL: `/jobs` の求人詳細内。権限: 認証済み求職者、架空の認可済み求人と受付設定（09:00-10:30・30分間隔）、同一求人の予約中／未予約状態。実画面キャプチャではなくソースを基準化。
- Native: `native/src/app/visits.tsx`, `native/src/lib/visitBookingForm.ts`。`native/color-explicit-document-rpc-no-downgrade-r143-20261111` のHEAD `8b1ef977c809fd78ebf3936b7e685ca933082a31` が基点。単独Color担当の専用ブランチ `native/color-visit-booking-web-parity-r144-20261111`。編集前に開いているPRが0件であることを確認。
- 対象: Native求職者の見学・体験予約UIと限定回帰のみ。Web・DB・RLS・RPC・認証・本番変更なし。

## Webとの機能差と実装
- 以前は開始時刻を任意の文字列として入力可能だった。Webの施設設定から生成する開始時刻候補（開始・終了、最低15分間隔、既定30分）をNativeで選択可能な44px以上のピンク色ボタンとして実装。設定にない時刻は予約ボタンを無効化。
- 存在しない日付（例: 2月30日）をクライアントで拒否。日付は現在テキスト入力（`YYYY-MM-DD`）のため、Web標準のOS日付ピッカーと同等のNative picker UXは**未達**。Server `hc_request_visit` の曜日・通知猶予・受付範囲・権限判定が最終権威であり、クライアントの表示だけで「予約可能」を保証しない。
- 同じ求人に `requested`/`confirmed` の予約が既にある場合は新規申込を表示せず、現在の予約を案内（他求人の予約や過去の終了履歴は妨げない）。
- Webの見学・体験所要時間、受付曜日、受付可能時間、事前通知時間、予約可能日数、持ち物、服装、施設案内、園現地時間の説明、1000文字上限をNativeへ接続。
- 許諾済みの既存 `listCandidateVisits`、`getVisitSettings`、`requestVisitDurable`、`cancelVisit` を維持。合成求人や予定の生成はなし。

## 受入マトリクス
| フロー | Webソース | Nativeソース | Android実行 | iOS実行 | DB再取得 |
|---|---|---|---|---|---|
| 施設の受付設定→予約時間選択→申込 | 上記main | 実装・限定テストPASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 同一求人の予約中表示と重複予約阻止 | 上記main | 実装・限定テストPASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 日付Picker、OSキーボード・長文・幅別UI | Web標準 date input | 日付テキスト、時間チップ。Pickerは未達 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

## 検証・費用・残課題
- 実行環境 Linux Node v22.16.0、npm 10.9.2、TypeScript CLI使用可。ローカルの実ソースとGitHub blobsが一致した後に `node --experimental-strip-types --test native/qa/native-visit-booking-web-parity.test.mjs` **6/6 PASS**。単独 `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/visitBookingForm.ts` **PASS**。
- CI向け `native/qa/native-visit-booking-parity-contract.mjs` を追加。実画面ソースとの12件の静的接続検証を含む。完全なチェックアウトがなく、この契約テストはローカルで**未実行**。Nodeの結果はExpo全体型検査・Native実行・Webとの同一状態の視覚比較に代わらない。
- `.github/workflows/ci.yml` はPRとmain pushで起動、Android prebuildを含む。ブランチのみの変更、PR作成・main merge・EAS・有料Actions起動・本番・Store公開なし。外部サービス全体の利用料金/残枠は未確認。
- Android SDK・エミュレーター、macOS/Xcode、署名・配布経路を本環境では確認できない。完全なExpo依存取得とAndroid/iOS別の正式な画面QA・予約結果再取得・署名済み受入ビルドが必要。日付PickerのUIを既存承認済み環境で実装・検証後、Web `/jobs` の予約UIとNative `/visits` の画面配置差も評価。状態 **IMPLEMENTING**。
