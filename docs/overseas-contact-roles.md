# 海外MVP：連絡先と企業属性（2026-09-09）

公式サイト調査に限った追加。候補検索・国・重複除外・国内・FDAの処理は変更しない。

## 連絡先

- 既存`emails`を維持し、先頭のメールを`email`にも保持。
- `contactFormUrl`は同一公式ドメインの取得HTMLで、問い合わせ文脈、連絡先入力欄、本文欄、送信ボタンを確認できたページだけを採用。
- Contact / Inquiry / Enquiry / Get in touch / Kontakt / Nous contacter / Aanvraag / お問い合わせ等を優先巡回。メールが見つかっても未確認の問い合わせページを探索する。
- URLやiframeだけではフォームと確定しない。SNS・Calendly、ニュースレター・検索フォームは対象外。フォーム送信はしない。
- `contactStatus`: `email_found` / `form_found` / `email_and_form_found` / `not_found` / `fetch_failed`。連絡先があれば取得済み状態を優先。一部取得の失敗は従来の`warnings`にも残す。連絡先なしで取得失敗・取得制限があれば`fetch_failed`。
- JavaScript生成フォームは公開HTMLで実要素を確認できないため未確認。`not_found`は取得範囲内で未検出という意味で、サイト全体に存在しないとの断定ではない。

## 属性・根拠

`companyRoles`に`role`・`evidenceUrl`・`evidenceText`を保持。属性はimporter / distributor / wholesaler / supplier / retailer / ecommerce / cafe_or_shop / manufacturer / unknown。未確認時はunknownで根拠はnull。確定属性の根拠は共通`evidence`にも登録する。

同一公式ドメインの自己説明・短い役割説明を使い、属性ごとに最大1件の短い根拠を保持。ブログ・引用・レビュー、否定文、他社・供給先・顧客への言及は除外する。単なる日本茶、品質表現、世界発送だけでimporter/distributorにしない。英語およびドイツ語・フランス語・オランダ語の主要表現に対応するが、辞書にない言い回しはunknownになり得る。

## 原産地・互換性

今回のクライアント条件に合わせ、A/B/Cから日本産必須条件と他国産によるC判定だけを除去。会社主体・所在地、抹茶商品の種類、B2B、明示的小売専業などの既存条件は維持。商品ごとの原産地・日本の産地・Supplier関係も維持する。日本産不明・Supplier不明だけで除外しない。

`ruleVersion`を2へ更新。旧保存結果はそのまま表示でき、「保存結果を利用して再開」でページキャッシュから新ルールを適用できる。候補由来の結果は引き続き画面内のみ、手入力結果は既存IndexedDBに保存。

取得上限は既存の8 HTTP要求・6 HTMLページ・約42秒・1応答750,000バイトを維持。robots.txt・リダイレクト・アクセス制限も維持する。

## 検証

- `node --test tests/*.test.mjs`：62件成功（既存55件＋連絡先・属性の回帰テスト7件）。既存の原産地抽出の期待値を維持し、原産地がA/B/Cを左右しない期待値に更新。
- 5社（USA 2 / Germany 1 / France 1 / Netherlands 1）を実候補から選び、国・名前・URLの引き渡し、調査結果・連絡先状態・属性根拠の表示を確認。
- HTML取得できた4社はメール取得、うち3社は実フォーム確認。1社のフォームはJavaScript生成のため未確認。残る1社はページ容量上限でfetch_failed / unknownを表示。
- 今回変更したサービス群のESLintは成功。画面のESLintには作業前のHEADにも存在する`react-hooks/refs`エラー2件が残る（既存の一時保存表示部分）。今回の機能とは別の既存問題として記録。
- 実候補一覧や企業ごとの実データはこの文書・テストに保存しない。テストは架空fixtureのみ。
