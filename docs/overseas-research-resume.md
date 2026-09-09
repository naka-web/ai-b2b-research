# 新規Google Maps候補の調査停止の検証（2026-09-09）

## 復元した停止地点

前タスク「海外MVP第1段階を再開」のテキスト履歴、現在の差分、未追跡ファイル、関連コードを確認。別チャットの画像は使用していない。
Matchiaの公式自己記述対応（identity.ts / extraction.ts / overseas-identity.test.mjs）は実装済み。37テストとbuild成功済み。その後AKIMATCHAのrobots.txtが301で停止するところまで調査済みで、転送修正は未着手だった。既存変更は保持。

## 原因と変更

候補選択でcountry=US、companyName→name、candidateOfficialUrl→websiteがフォームに渡る。新規UUIDでpendingCompanyを生成し、手入力と同じAPI body（id/name/country/website/refresh）で同じresearch→extract→assessを実行する。候補ID/sourceType/候補説明は判定へ渡さない。candidateInput/transientIdsはIndexedDB保存の抑止のみで、API結果をReact stateへ反映する処理は共通。これは前回選択済みの保存仕様。

共通障害はrobots.txtの301を追わず、HTML取得前に確認待ちにしていたこと。HTTPやwww付きURLで発生し、手入力でも同じURLなら再現する。保存済み結果ではネットワーク取得を省略するため目立たなかった。

siteResearch.tsのみ修正：
- robots.txtの同一ドメイン内転送を最大2回追跡。転送先にも既存のURL/IP検証と取得予算を適用。
- 実際にrobots.txtを確認したoriginを調査内で再利用。ページ転送先が未確認originなら先にrobots.txtを確認。
- AKIMATCHAで追加再現した容量超過時のPromise未終了を修正。容量超過・通信中断を明示的にrejectする。
- 750,000バイト、8 HTTP要求、6 HTMLページ等の既存上限・403停止・判定ルールは維持。

## 実取得と画面確認

| 対象 / 入力URL | 修正前 | 修正後（refresh=true） |
|---|---|---|
| AKIMATCHA / http://www.akimatcha.com/ | robots 301、0 HTML、0根拠 | robots 301→301→200、トップ200だが容量超過。0 HTML、0根拠、判定なし・確認待ち。ハングせず終了 |
| Keicha / https://www.keichamatcha.com/ | robots 301、0 HTML、0根拠 | robots 301→200、最終トップ https://keichamatcha.com/ は200。5 HTML・445,347文字・19根拠、住所/抹茶/日本産/B2B確認、A。8要求上限の警告あり |
| Matchia.us / https://matchia.us/ | A | A、6 HTML・1,604,199文字・70根拠 |
| WAKABA / https://matcha-wakaba.com/ | A | A、6 HTML・1,093,697文字・15根拠 |
| AIYA America / https://www.aiya-america.com/ | robots 301で確認待ち | 3 HTML・940,200文字・3根拠。住所取得後に403で停止、確認待ち、判定なし |

Keichaは補助的にhttp://www.keichamatcha.com/でも再現・解消を確認（3 HTML、262,894文字、8根拠、A）。その後実際の候補検索で取得したURLはhttps://www.keichamatcha.com/だったため、このURLでも修正前コードと修正後コードを比較した。

ビルド後のブラウザでGoogle Maps候補検索→「この企業を調査」→「調査開始」を実行：
- Keicha：住所・抹茶原料・日本産・公式B2B記述・A/完了・21根拠が表示された（キャッシュ併用で6ページ）。
- AKIMATCHA：候補の装飾付き企業名とhttp URLをそのまま受け渡し。容量超過の理由付き確認待ちで終了。未取得項目は未確認。
- Matchia.us | Matcha Wholesale：A/完了・68根拠。住所欄は未確認のまま、公式自己記述で対象国主体を確認。装飾なしのMatchia.usをAPIで調査した場合は住所も抽出された。この既存の名称依存差は今回の取得障害とは別のため変更していない。

ビルド後のAPIで上記5社を再実行し、すべてHTTP 200で結果オブジェクトを返すことも確認。Keichaはキャッシュ併用で6ページ・21根拠・警告なしのA。AIYAは住所のみ確認、抹茶/日本産/B2Bは未確認のまま。

## 検証

- node --test tests/*.test.mjs：44件成功（既存37件＋追加7件）。
- 追加テスト：HTTP/www転送後の手入力との根拠一致、robots禁止/403/循環/別ドメイン停止、ページ転送先robots確認、容量超過/途中切断の確実な終了。
- npm run build：成功、TypeScript成功。
- git diff --check：成功。
- 今回の変更：services/overseas/siteResearch.ts、tests/overseas-redirects.test.mjs、本検証記録。
- 国内検索・FDA・候補検索・既存判定・UIは変更なし。commit/pushなし。
