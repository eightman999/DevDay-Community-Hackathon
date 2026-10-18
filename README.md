# CELLWATCH — 夜間システム監視局

**面白くて遊んでいたら、情報漏洩につながる判断ミスと対処が分かる。**

個人情報漏洩という社会課題に、楽しさを入口に学べるゲームで応えることを目指しています。あなたは夜間監視員。120秒間、通信の申請書を照合し、通すか止めるかを決めます。見落とした脅威は赤いセルとなって広がり、正常な通信まで止めれば利用者の信頼を失います。隔離・修復で対処し、理由付きの答え合わせから再挑戦できます。

**[公開ゲームを遊ぶ](https://cellwatch-inspection.eightman.chatgpt.site/)** · [作品概要と審査根拠](cellwatch/REVIEW.md) · [デモ手順](cellwatch/DEMO.md)

## 遊びから何を学ぶか

| ゲームで行うこと | 触れられる判断 |
| --- | --- |
| 申請書の二つの欄を照合 | 本人確認、共有権限、通信量、資料の送り先 |
| 保全率と信頼を両方守る | 危険を止めることと、正常な利用を妨げないこと |
| 拒否・隔離・根本修復を選ぶ | 一件の対処、時間の確保、再発防止の違い |
| 正解と理由を読み、再挑戦 | 自分の判断の振り返り |

面白さと学習効果は設計目標で、利用者調査による効果測定はこれからです。ゲームは架空の申請を扱い、実際の個人情報や通信を取得しません。

## 資料の入口

| 読みたい内容 | 文書 |
| --- | --- |
| 社会課題・対象者・独自性・審査4項目 | [作品概要](cellwatch/REVIEW.md) |
| 提出フォームや短い紹介に使う文章 | [提出用紹介文](cellwatch/SUBMISSION.md) |
| 操作して確かめる順序と期待結果 | [デモ](cellwatch/DEMO.md) |
| 自動テストとブラウザ確認の範囲 | [検証記録](cellwatch/VERIFICATION.md) |
| DevDay新機能の出典と実装状態 | [機能利用の根拠](cellwatch/FEATURES.md) |
| ゲームのルール・構成・学習内容 | [仕様書](cellwatch/spec.md) / [教科書](cellwatch/textbook.md) |
| 提出前に残っている作業 | [準備状況](cellwatch/READINESS.md) |
| 既存Sitesへ反映する手順と現在の制約 | [公開手順](cellwatch/DEPLOYMENT.md) |

## 実装と動かし方

中心作品のソースは **`cellwatch/`**、公開ファイルは **`cellwatch/dist/`** です。Node.jsとPython 3を使い、依存インストールとビルドは不要です。

```sh
cd cellwatch
npm run check
npm test
npm run dev
```

ローカルURLは `http://127.0.0.1:8766/`。詳細は [開発README](cellwatch/README.md) にあります。

ゲームの判定は固定ロジック。脅威の自己複製はHighLifeで計算します。モデルAPI・Sites MCP連携は未実装です。SitesでのWeb公開と、DevDayで発表された新機能の活用は[区別して記録](cellwatch/FEATURES.md)しています。

## 他の試作

リポジトリ直下の `index.html`、`style.css`、`game.js` は **PATCH / PANIC** です。CELLWATCHの起動時は上記の `cellwatch/` を使ってください。

[PATCH / PANICの説明・起動・検証記録](docs/patch-panic.md)。既存実装は保持しています。

## イベント

[DevDay Community Hackathon公式案内・審査基準](https://luma.com/OpenAIDevDay2026CommunityHackathonTokyo)
