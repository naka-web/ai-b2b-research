# AI企業リサーチアシスタント

## デモサイト

👉 https://ai-b2b-research.vercel.app
<img width="2356" height="1304" alt="2026-07-10 16 33の画像" src="https://github.com/user-attachments/assets/0ce18dc7-6adf-40fc-b17a-d5ca8161b6b0" />
<img width="2358" height="1314" alt="2026-07-10 16 34の画像" src="https://github.com/user-attachments/assets/afb31793-68bd-467b-a72b-5171355882e4" />
<img width="2624" height="1580" alt="2026-07-10 16 37の画像" src="https://github.com/user-attachments/assets/d6a26041-0089-4f1a-aabf-34e80f787597" />

---

## 概要

BtoB営業担当者向けの企業リサーチ支援アプリです。

Google Places API (New) を利用して実在企業を検索し、企業情報の確認、AIによる企業概要・営業メールの生成、必要な企業の選択、CSV・Excel出力まで行える営業リサーチ支援アプリです。

---

## 主な機能

## 主な機能

- Google Places API (New)による実在企業検索
- キーワード・地域・業種で検索
- 企業一覧表示
- 企業詳細表示
- Google Maps・公式サイトへのリンク
- AI企業概要の生成
- AI営業メール生成
- 必要な企業のみ選択
- CSV出力
- Excel(.xlsx)出力
- 検索結果の重複除去
- 「さらに読み込む」による追加取得
---

## 使用技術

- Next.js
- React
- TypeScript
- Tailwind CSS
- OpenAI API
- Google Places API (New)
- Vercel
- GitHub
- SheetJS (xlsx)

---

## セットアップ

```bash
npm install
npm run dev

# 本番ビルド
npm run build

---

## 🚀 今後の開発予定

- [ ] PR TIMES APIとの連携
- [ ] Wantedly求人情報の取得
- [ ] PDFレポート出力
- [ ] AI営業メールの複数パターン生成
- [ ] ログイン機能
- [ ] 検索履歴・お気に入り保存
- [ ] CRM連携
- [ ] AI営業先ランキング機能
- [ ] 業種ごとの営業テンプレート生成

## 今後検討している機能

- 認証機能
- 決済機能
- チーム利用機能
- API連携の拡充
- ダッシュボード機能

---

## ライセンス

MIT License
