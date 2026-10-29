# 転職シミュレーター データ契約（A: 求職者アプリ ⇔ B: 市場データ）

A は画面と本人の比較体験、B はデータの取得・正規化・集計を担当する。A は下記の RPC だけを読み、
同じ計算を重複実装しない。未提供の項目は「準備中」と表示し、推定値で埋めない。

## 3つの指標（混ぜて平均しない）

| key | 意味 | 提供元 | 状態 |
| --- | --- | --- | --- |
| `official_wage_stats` | 公的統計による給与実績（賃金構造基本統計調査）。月額・所定内給与。賞与は別項目 | B（e-Stat 取込） | 未提供。`hc_jobseeker_official_wage_stats_v1` |
| `posted_salary` | 求人票の募集給与（月給の下限）。Hoiku Color に現在公開中の求人のみ | A migration（本PR） | `hc_jobseeker_salary_market_v1` |
| `own_salary` | 本人が入力した現在の額面月給 | 本人 | `hc_jobseeker_*_career_conditions`（保存は任意） |

### `hc_jobseeker_official_wage_stats_v1(p_prefecture text, p_occupation text)`（B が提供）

A が期待する戻り値。2つのリストは**別々に**返し、A も別々に表示する。

```json
{
  "reference_year": 2025,
  "source": "賃金構造基本統計調査",
  "source_url": "https://www.e-stat.go.jp/...",
  "occupation": "保育士",
  "national_by_experience": [
    { "experience_label": "5〜9年", "experience_min_years": 5, "experience_max_years": 9,
      "monthly_scheduled_cash_yen": 0, "worker_count_thousand": 0.0 }
  ],
  "prefecture_all_experience": { "prefecture": "秋田県", "monthly_scheduled_cash_yen": 0, "worker_count_thousand": 0.0 }
}
```

- 全国の経験年数別と都道府県別（経験年数計）を**掛け合わせて**「地域×経験年数」の給与を作ることを**禁止**する。
  公表されている粒度のまま返す。
- 項目が無い・秘匿の場合は `null`。A は「公表なし」と表示する。
- 統計の月額は所定内給与、求人票は募集時の月給で定義が異なるため、A は並べて見せるが差を評価しない。

## 求人票の集計（本PRの RPC）

- 母集団は `hc_jobseeker_job_feed` ∪ `hc_external_job_public_feed`（求職者の求人検索と同一）。
- 外部求人は 168 時間以内に再確認されたものだけが公開フィードに入る。同期はカーソル順に進むため、
  **地域によって件数に偏りがある**。`facets.coverage` に都道府県別件数を返し、A は「全国の相場」と表示しない。
- 月給の下限が 10万〜100万円の求人のみを対象にし、時給・年収・範囲外は件数だけ返す。
- 件数が 5 件未満の条件では中央値を返さない（`monthly_lower_bound: null`）。

## 構造化データ（2026-10-23 提供済み: migration 20261023001200）

`hc_external_job_sources` に次の列を持ち、公開フィード `hc_external_job_public_feed` の末尾に追加して公開する。
値は DB のトリガー（`hc_private.hw_structure_trigger_v1`）が、保存済みの求人テキストから**決定論的に**導く。
推測や補完はしない。曖昧な場合は NULL / `unknown`。

| 列 | 内容 |
| --- | --- |
| `annual_holidays_days` | 求人に**明記された**年間休日日数（50〜200 の整数）。「完全週休2日制」「日曜・祝日」等から計算しない |
| `annual_holidays_basis` | `exact`（「123日」）/ `minimum`（「125日以上」） |
| `annual_holidays_source` | `hellowork_field`（ハローワーク求人票の「年間休日数」欄）/ `holidays_text` / `description_text` / `title_text`。正式欄が常に優先 |
| `occupation_group` | `hoikushi` / `hoiku_kyoyu` / `yochien_kyoyu` / `hoiku_hojo` / `nurse` / `nutritionist` / `cook` / `director` / `childcare_support` / `child_instructor` / `multiple`（タイトルに複数職種）/ `unknown` |
| `occupation_groups` | タイトルが挙げる全職種（`unknown` は空配列）。集計 RPC の `p_occupation` はこの配列に含まれるかで絞り込む |
| `occupation_source` | `title`（求人タイトル）/ `qualification`（タイトルに職種が無く、必須資格が1種類だけのとき） |

年間休日の読み取り規則:
- 「年間休日」の直後に数字が続くものだけ（「年間休日123日」「年間休日数：107日」「120日の年間休日」。全角数字可）。
- 「約」「程度」「前後」「〜（範囲）」「選択制」、複数の異なる数字、50〜200 の範囲外、日の記載なしは **すべて NULL**。
- 求人票の正式欄（「年間休日数 107日」）があれば本文より優先する。インポーターがその欄を `annual_holidays_field_text` に保存する。
- 本文どうしでは「休日等」→「仕事内容」→「職種（タイトル）」の順。上位が曖昧なら下位へ進まない。

職種は**求人タイトルだけ**で分類する（仕事内容には保育士の語が頻出するため使わない）。タイトルに職種が無いときだけ、
「必須」の資格が1種類に決まる場合に限り資格で補う。決まらなければ `unknown`。

調査メモ（本番, 2026-10-23）: 有効 25,827 件のうち年間休日を読み取れたのは 667 件（約 2.6%）。
ハローワークの求人票には「年間休日数」欄があるが、従来のインポーターは保存していなかった。
再確認（下記）で求人票を取り直すたびに、この欄が保存される。

### 「N日以上」と「N日を超える」（年間休日の境界）

`hc_jobseeker_career_scenario_jobs_v1` は 2 つを別のパラメータで受け取り、両方を満たす求人だけを返す。

| パラメータ | 意味 | 画面の入力 |
| --- | --- | --- |
| `p_holiday_floor` | 年間休日 **> N**（超える） | 「今の年間休日」（今より多い） |
| `p_holiday_at_least` | 年間休日 **>= N**（以上） | 「希望の年間休日 N日以上」 |

求人側の `annual_holidays_basis = 'minimum'`（「125日以上」）は下限値として扱い、保証される範囲だけで判定する
（125 以上の求人は「120 を超える」「125 以上」を満たすが、「125 を超える」は満たさない）。

## 公開範囲の回復（再確認）

公開フィードの条件（`last_verified_at` が 168 時間以内）は変更しない。`last_verified_at` は、インポーターが
ハローワークの公式ページを実際に取得できたときにだけ書き込む。
2026-10-13/14 の一括取得後に日次バッチだけになったため、約 25,700 件が 168 時間を過ぎて公開フィードから外れていた。
pg_cron `hc-hellowork-reverify`（5分ごと・40件）が、既知の求人を都道府県ごとに公平に再確認する
（詳細は docs/hellowork-import.md）。ハローワーク側で終了した求人（「該当する情報は見つかりませんでした」）は
非公開（`removed`）になる。

## 保存条件（本PRの RPC）

- `hc_jobseeker_get_career_conditions()` / `hc_jobseeker_save_career_conditions(jsonb)` /
  `hc_jobseeker_delete_career_conditions()`。本人は JWT の `sub` で特定し、引数で識別子を受け取らない。
- 希望地域・希望最低月給は既存の希望条件（プロフィール）をそのまま使い、複製しない。
- 本人の給与・休日は URL・GA4・ログに出さない。

## 年間休日の分布（キャリアダッシュボード, migration 20261028090000・未適用）

`hc_jobseeker_holiday_market_v1(p_prefecture, p_employment_type, p_occupation)` は、求人票に**明記された**年間休日
（`annual_holidays_days` / `annual_holidays_basis`）を 6 つの帯に数えるだけの集計で、推測・補完はしない。

- 母集団は給与相場と同じ `hc_private.career_posted_jobs_v1()`。日数の記載がない求人は `unstated_count` に数え、帯には入れない。
- `minimum`（「125日以上」）は記載された下限の帯に入れ、`minimum_count` として別に返す。A は「以上」と表示する。
- 記載のある求人が 5 件未満なら `bands: null`（A は「件数が足りません」と表示する）。
- 未適用のあいだ A は `CareerApiUnavailableError` を「準備中」として表示する。共有 migration の管理者のレビュー後に適用する。

## 有休・残業・離職・勤続・育休（キャリアダッシュボード）

2026-10-28 時点で、求職者が読める公開ソースは次のとおり。A は存在しない指標を表示・推定しない。

| 指標 | 公開ソース | 状態 |
| --- | --- | --- |
| 年間休日 | 求人票（上記） | 提供済み（集計 RPC は未適用） |
| 有休取得率・日数 / 月平均所定外労働時間 / 平均勤続年数 / 離職率 / 育休取得・復帰 | なし（`hc_public_workplace_profiles` は施設単位・公開同意制で、公開 0 件） | 「公表データはまだありません」と表示 |

- 平均勤続年数を離職率の代わりにしない。法人全体の公表値・施設の検証済みデータ・施設の自己申告は、提供元を分けて表示する。
- 求人の `facility_claims`（施設の記載）は自己申告で、検証済みと表示しない。

## キャリアダッシュボードの計測（GA4）

個人の数値・識別子・自由記述は送らない。送るのは画面上の位置と状態の区分だけ。

| イベント | 送る値 |
| --- | --- |
| `hc_dashboard_view` | `first_view`（このブラウザで初回か）, `profile_state`（`empty`/`partial`/`complete`） |
| `hc_dashboard_cta` | `cta`（固定のスロット名） |
| `hc_auth_start` / `login` / `sign_up` | 既存の値に加えて `entry`（戻り先の画面名, 例 `career`）, `cta`（hoikucolor.jp から渡された英小文字のスロット名） |
| `hc_job_saved` | `surface`（`home`/`jobs`/`saved` など） |
| `hc_apply_start` / `hc_apply_complete` | `surface`。完了は応募 RPC が成功したときだけ |
