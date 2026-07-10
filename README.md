# AI企業リサーチアシスタント

## デモサイト

👉 https://ai-b2b-research.vercel.app

<img width="2358" height="1314" alt="2026-07-10 16 34の画像" src="https://github.com/user-attachments/assets/d47ad117-a24f-4d18-bed3-40dea3b470e2" />
<img width="2356" height="1304" alt="2026-07-10 16 33の画像" src="https://github.com/user-attachments/assets/1f12c4c9-6a47-41c4-906d-b2af42a09fcd" />
<img width="2624" height="1580" alt="2026-07-10 16 37の画像" src="https://github.com/user-attachments/assets/3ccf71e1-277e-4cfc-acaf-a95387a463a3" />


## 概要

BtoB営業担当者向けの企業リサーチ支援アプリです。

Google Places API (New) を利用して実在企業を検索し、
企業情報の確認、AIによる企業概要の生成、
営業提案、営業メール作成までを一つの画面で行えます。

営業前の企業調査を効率化することを目的とした
ポートフォリオ向けMVPとして開発しました。

---

# 主な機能

- Google Places API(New)による実在企業検索
- キーワード・地域・業種・従業員数以上で検索
- AIによる企業概要の生成
- AI営業提案の生成
- AI営業メールの自動生成
- Googleマップ・公式サイトへのリンク
- 企業詳細画面

---

# 使用技術

- Next.js(App Router)
- React
- TypeScript
- Tailwind CSS
- OpenAI API
- Google Places API(New)
- Vercel

---

# セットアップ

```bash
npm install
npm run dev
```

ブラウザ

```
http://localhost:3000
```

ビルド確認

```bash
npm run build
```

---

# 環境変数

```
OPENAI_API_KEY=xxxxxxxx
GOOGLE_PLACES_API_KEY=xxxxxxxx
```

---

# ディレクトリ構成

```
app/
├── api/
│   ├── companies/
│   ├── summarize/
│   └── sales-email/
├── page.tsx
├── services/
├── components/
└── types/
```

---

# 設計

企業データ取得処理はサービス層へ切り出し、
Google Places API(New)から企業情報を取得しています。

AI機能はOpenAI APIを利用し、

- 企業概要
- 営業提案
- 営業メール

を生成します。

将来的なPR TIMESやWantedly連携も容易に追加できる構成になっています。

---

# 今後の拡張予定

- PR TIMES連携
- Wantedly連携
- PDF出力
- ログイン機能
- CRM連携
- 検索履歴
- お気に入り機能

---

# 注意事項

本アプリはポートフォリオ向けMVPです。

AIが生成した内容は営業活動前に必ず人が確認することを前提としています。
