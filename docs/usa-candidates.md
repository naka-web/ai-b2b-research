# USA候補検索 MVP

`/overseas` の「USA候補検索」→ 候補一覧 →「この企業を調査」→ 既存フォーム →「調査開始」。
選択だけでは公式サイト取得を開始しない。最終判定は既存の `services/overseas` に委ねる。

## 取得元・制限

- 実装済み取得元は Google Places API (New) Text Search のみ。既存の `GOOGLE_PLACES_API_KEY` を利用する（互換キー名は `GOOGLE_MAPS_API_KEY` / `GOOGLE_API_KEY`）。キー未設定・契約/権限エラー時にダミー候補へフォールバックしない。
- USAの9検索語から最大3個選択。各最大10件、総候補上限30件。ページ送り・企業サイト巡回・Place Details追加取得なし。
- `regionCode: US` は検索の偏り指定にすぎないため、応答の `addressComponents` に国コード `US` がある結果だけを採用する。
- `matcha_direct` は取得した名称にmatchaの記載がある候補。日本産、商品、B2B、法人確認済みを意味しない。検索語そのものは分類根拠にしない。
- HS・商品説明・貿易方向・SupplierはPlacesでは取得しないため空欄。HS 090210/090220単独、green tea、green tea powderは抹茶確定ではない。
- 企業名・ドメイン・所在地が一致する場合、または矛盾のない同じPlacesレコードだけを統合。異なる名前・所在地・ドメインを持つ候補は統合しない。支店と法人を完全に同定する機能ではない。

## 保存と利用規約

ユーザーの「Google Placesで進める（保存制約に合わせる）」選択により、候補データの永続キャッシュは行わない。
HTTP応答は `no-store`。同一条件の成功結果は現在表示中の画面を再利用する。ページ再読み込み後は再検索が必要。
候補から開始した調査は結果も含めReactの画面状態だけで保持し、既存IndexedDBには書き込まない。手入力調査のIndexedDB保存・再開は変更しない。
独立に取得した公式サイトHTMLの既存キャッシュ処理は変更しない。
Google Mapsの出典、第三者帰属、利用規約・プライバシーポリシーへのリンクを一覧に表示する。

- [Placesの保存・帰属ポリシー](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Text Search仕様](https://developers.google.com/maps/documentation/places/web-service/text-search)

APIは8秒でタイムアウトし、失敗後の追加キーワード検索・自動再試行を停止する。サーバープロセス内で同時検索1件、検索開始間隔30秒に制限する。失敗した検索はユーザー操作で再試行できる。分散環境を跨ぐレート制限は今回のローカルMVPの対象外。

## 将来のprovider差し替え

`CandidateProvider` の `search` が候補と取得統計を返す。APIルートのprovider生成箇所を差し替える。
`CandidateSearchConditions` に任意の `hsCodes` / `productTerms`、`conditions.ts` に貿易検索用の条件を定義しているが、Places providerはそれらを受け付けない。
貿易APIの仮接続、貿易サイトのスクレイピングは実装していない。新provider導入時に実際の契約・保存許可に従って保存方針を決める。

## 検証

```sh
node --test tests/*.test.mjs
npm run build
```

2026-09-09の実API確認：3検索リクエスト、9候補（matcha_direct 5 / green_tea_candidate 0 / unconfirmed 4）、重複除外7件、USA所在地等を確認できない結果1件を除外。同一条件の再クリックは追加0回。
選択した1社の名前・USA・URLが既存フォームに渡ることと、選択だけでは調査されないことを確認。
「調査開始」後は公式サイトHTTP要求1回、robots.txtのHTTP 301により既存ロジックが確認待ちに停止。別タブを開いて候補由来の調査結果が永続保存されていないことを確認。
候補の実データはこの文書やテストファイルには保存していない。テストの企業データは架空fixtureのみ。

国内検索は既存サンプルによる東京都フィルタ、FDAは入力検証を確認。外部Google検索・FDA取得全体の再実行はしていない。
