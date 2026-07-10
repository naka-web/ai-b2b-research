# AI企業リサーチアシスタント

## デモサイト

👉 https://ai-b2b-research.vercel.app

<img width="1432" height="631" alt="スクリーンショット 2026-07-09 20 37 23" src="https://github.com/user-attachments/assets/77bf9744-2fd3-4704-80e6-ca800788dcf1" />
<img width="1419" height="739" alt="スクリーンショット 2026-07-09 20 37 41" src="https://github.com/user-attachments/assets/f2a76334-5531-40cd-a1d6-fcc135ad0040" />
<img width="1436" height="748" alt="スクリーンショット 2026-07-09 20 40 21" src="https://github.com/user-attachments/assets/5967c45f-1fad-47e7-a019-f6617cbe1630" />


BtoB営業担当者向けの企業リサーチ支援アプリです。企業検索、企業詳細の確認、AIによる要約、営業提案、営業メール作成までをひとつの画面で試せるMVPとして実装しています。

Google Places API (New) を利用し、実在企業を検索できます。

検索結果から企業詳細を確認し、AIによる企業要約と営業メールを自動生成できます。

営業前の企業調査から営業メール作成までを一つの画面で完結できるMVPとして開発しました。

## 主な機能

- Google Places APIによる実在企業検索
- キーワード・地域・業種で検索
- AIによる企業要約
- AI営業メール自動生成
- 企業詳細画面
- Google Maps・Webサイトへのリンク
- 企業一覧
  - 企業名、業種、地域、従業員数、概要をカード形式で表示
- 企業詳細
  - 事業内容、課題、提案できるサービスを表示
  - 会社HP、Google Maps、PR TIMES、Wantedly、採用ページへの情報ソースリンクを表示
- AI要約
  - OpenAI APIを使って企業情報を営業担当者向けに要約
- AI営業提案
  - 想定課題、営業切り口、初回提案文、架電トーク例を生成
- AI営業メール
  - AI要約と営業提案をもとに、件名と本文を含む丁寧なBtoB営業メールを生成

## 使用技術

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- OpenAI Responses API
- Google Places API (New) 連携用サービス層

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで以下を開きます。

```text
http://localhost:3000
```

品質確認用コマンド:

```bash
npm run lint
npm run build
```

## 環境変数

`.env.local` をプロジェクトルートに作成し、必要な環境変数を設定します。

```env
OPENAI_API_KEY=your_openai_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

| 変数名 | 必須 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | AI機能を使う場合は必須 | AI要約、AI営業提案、AI営業メール生成に使用 |
| `GOOGLE_MAPS_API_KEY` | 任意 | Google Places API (New) で実在企業検索を行うためのキー |

`GOOGLE_MAPS_API_KEY` が未設定、またはGoogle Places APIの呼び出しに失敗した場合は、ダミー企業データへ自動フォールバックします。

`.env.local` は `.gitignore` の `.env*` によりGit管理対象外です。APIキーなどの秘密情報はリポジトリにコミットしないでください。

## ディレクトリ構成

```text
app/
  api/
    companies/route.ts      # 企業検索API
    sales-email/route.ts    # AI営業メール生成API
    summarize/route.ts      # AI要約・営業提案生成API
  page.tsx                  # メイン画面
services/
  companyService.ts         # 企業データ取得の集約サービス
  companyTypes.ts           # 企業データ関連の型定義
  companySearchOptions.ts   # 検索条件の選択肢
  googleMapsService.ts      # Google Places API連携
```

## 設計メモ

企業データ取得は `companyService` を入口にしています。現時点ではGoogle Maps APIが利用可能ならGoogle Places API (New) を呼び出し、利用できない場合はダミーデータへフォールバックします。

将来的にPR TIMESやWantedlyなどを追加する場合も、外部サービスごとの取得処理を `services/` に追加し、`companyService` で統合する方針です。

## 今後の拡張予定

- Google Places APIの検索精度向上
- PR TIMES検索APIとの連携
- Wantedlyや採用ページからの採用情報取得
- 企業ごとのニュース・プレスリリース要約
- 営業メールのトーン選択
- CRM連携
- 検索履歴とお気に入り企業の保存
- 企業詳細ページのURLルーティング化
- 認証とユーザー別ワークスペース

## 注意事項

このアプリはポートフォリオ向けMVPです。AIが生成する要約、営業提案、営業メールは営業活動の下書きとして扱い、実際の送信前に必ず人が内容を確認してください。
