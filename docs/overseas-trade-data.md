# HS / Trade Data候補取り込み

`/overseas` の「HS / Trade Data候補」からCSVを貼り付けるか、CSVファイルを選択する。解析はブラウザ内で行い、外部APIへ送信しない。

必須列:

```text
companyName,country,hsCode,productDescription,source
```

任意列:

```text
role,sourceUrl,originCountry,supplierName,importerName,exporterName,shipmentDate,quantity,unit,billOfLading,rawEvidence,officialWebsite
```

- `hsCode` は現在 `090210` / `090220` のみ受け付ける。どちらも緑茶のコードであり、抹茶確定には使わない。
- `role` は `importer` / `consignee` / `exporter` / `supplier` / `buyer` / `unknown`。未入力は `unknown`。
- `country` は実装済み9か国の国コードまたは英語名。中国など対象外の国は取り込まない。
- `officialWebsite` がない候補も一覧には残るが、公式サイト調査ボタンは無効になる。
- `matcha`を含む商品説明は高シグナル候補、一般的な緑茶記載やHSコードだけの候補は抹茶未確認として扱う。
- HS / Trade元根拠は`OverseasCompany.discoveryEvidence`に渡し、公式サイト調査結果とともにIndexedDBへ保存する。

## 公式サイト候補探索

`officialWebsite`が未入力の候補は、会社名と対象国を使って既存Google Places providerから候補URLを最大5件取得する。CSVにURLがある場合も、そのURLを確定扱いせず同じidentity確認を行う。

- `not_searched`: 未検索
- `candidate_found`: 候補URLを取得したが、サイト本文で会社・対象国を確認できない
- `verified`: 既存公式サイト調査のidentity判定で会社・対象国を確認済み
- `ambiguous`: 会社名一致が弱い、複数候補が近い、またはCSV記載URLとidentityが一致しない
- `not_found`: 対象国で利用可能な候補URLなし
- `fetch_failed`: Placesまたは候補サイトの取得失敗

一括検索は未検索候補を最大10件、同時2件で処理する。完了状態を自動再検索しない。`verified`だけが既存の「この企業を調査」へ進める。候補URLの事前確認にも既存`siteResearch.research()`と`identity.ts`を利用する。

実データproviderを追加する場合は、`services/overseas/candidates/tradeData.ts`の`CandidateImportProvider`実装と同じ候補変換を使う。取得部分だけをAPI providerへ差し替え、`TradeCandidate`、`tradeCandidateToCandidate`、既存公式サイト調査は再利用する。
