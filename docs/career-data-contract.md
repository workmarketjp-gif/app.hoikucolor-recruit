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

## B が提供するもの（本PRでは NULL）

`hc_private.career_posted_jobs_v1()` の次の列を、検証済みの値に置き換える。

| 列 | 内容 |
| --- | --- |
| `annual_holidays_days` | 求人票に**明記された**年間休日日数（整数）。「完全週休2日制」「日曜・祝日」等から計算しない |
| `annual_holidays_basis` | `exact`（「120日」）/ `minimum`（「120日以上」） |
| `occupation_group` | `保育士` / `保育補助` / `看護師` / `栄養士` / `調理員` など。公開フィードは保育施設で働く全職種を含み、現状は職種を区別できない |

調査メモ（本番, 2026-10-23）: ハローワーク由来の `holidays` は「休日 日曜日，祝日，その他 週休二日制…」という
定型文が大半。`年間休日` の記載は有効 25,827 件中 415 件で、数値は全角（「年間休日１２３日」）、
「125日以上」「年間休日数に誕生日休暇を含む」などの形がある。説明文（`description`）にも 253 件ある。
`source_payload` に年間休日の構造化項目は無い。正規化は B が行う。

## 保存条件（本PRの RPC）

- `hc_jobseeker_get_career_conditions()` / `hc_jobseeker_save_career_conditions(jsonb)` /
  `hc_jobseeker_delete_career_conditions()`。本人は JWT の `sub` で特定し、引数で識別子を受け取らない。
- 希望地域・希望最低月給は既存の希望条件（プロフィール）をそのまま使い、複製しない。
- 本人の給与・休日は URL・GA4・ログに出さない。
