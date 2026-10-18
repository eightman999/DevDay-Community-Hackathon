# CELLWATCH

**面白くて遊んでいたら、セキュリティインシデントのことも分かるゲームをつくる。**

個人情報漏洩を出発点に、情報やシステムを守る判断を、遊びを通じて知ることを目指しています。危険を見つけて止めるだけでなく、止めたことで必要な仕事にも影響が出る。その葛藤と、失敗してもう一度試す面白さを核にします。ゲームの楽しさを先に置き、最後の振り返りで現実のセキュリティにも少し触れられる形を目指します。

画面・操作・数値は試作中です。企画の正本は[コンセプト](cellwatch/CONCEPT.md)。病院を舞台にする案は[シナリオ候補](cellwatch/SCENARIO-HOSPITAL.md)にまとめています。現時点で病院ステージの採用は未確定です。

[現行プロトタイプを遊ぶ](https://cellwatch-inspection.eightman.chatgpt.site/) · [DevDay技術の役割と実装根拠](cellwatch/FEATURES.md) · [審査基準と根拠](cellwatch/REVIEW.md)

**技術の柱:** Dotsを音楽制作に利用しています（ユーザー申告）。制作工程での活用に加え、MCP EventsやAgents APIを体験に結びつけることを重視します。確認済みの接続コードは、別ブランチ[mainのDecisions API連携](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/server.mjs#L79)です。MCP Events／Agents APIの接続は現時点の調査では未確認。使う目的・実装箇所・実行結果を[技術資料](cellwatch/FEATURES.md)へ集約します。

## まず読む文書

| 順序 | 文書 | ここで決める・確認すること |
| --- | --- | --- |
| 1 | [コンセプト](cellwatch/CONCEPT.md) | 社会課題、対象、面白さ、学び、決まっていることと未決事項 |
| 2 | [病院シナリオ候補](cellwatch/SCENARIO-HOSPITAL.md) | WannaCry/NHSの史実、架空の舞台への置き換え、必要な追加設計 |
| 3 | [遊んだあとに触れる題材](cellwatch/LEARNING-TOPICS.md) | 脆弱性11種の短い解説候補。敵や攻略ルールの仕様にはしない |
| 4 | [審査基準と根拠](cellwatch/REVIEW.md) | 公式4項目、現在の証拠、不足する検証 |
| 5 | [提出用紹介文](cellwatch/SUBMISSION.md) | 企画の紹介と現行試作の説明に使える文章 |

## 試作の実装と作業記録

| 内容 | 文書 |
| --- | --- |
| 現行試作のルール・構成 | [仕様書](cellwatch/spec.md) |
| 現行試作を操作して確かめる | [デモ](cellwatch/DEMO.md) / [教科書](cellwatch/textbook.md) |
| 自動テスト・ブラウザ確認・未検証の範囲 | [検証記録](cellwatch/VERIFICATION.md) |
| DevDay新機能の出典と実装状態 | [機能利用の根拠](cellwatch/FEATURES.md) |
| 次に進めること | [準備状況](cellwatch/READINESS.md) |
| 開発・既存Sitesへの反映 | [開発README](cellwatch/README.md) / [公開手順](cellwatch/DEPLOYMENT.md) |

企画の変更はCONCEPT、舞台の具体化はSCENARIO-HOSPITAL、動いた事実はVERIFICATIONへ記録します。画面配置や現在のスコアを作品全体の確定要件として扱わず、実装が変わったら試作仕様とデモを更新します。

## 現在の試作

`cellwatch/` が中心作品、配信ファイルは `cellwatch/dist/` です。現在は汎用システムの夜間監視を題材にした120秒・16申請の固定ルール版。HighLifeで脅威が自己複製し、拒否・隔離・修復と理由付きの答え合わせを試せます。病院の業務・被害・復旧のシミュレーションは未実装です。

この `master/cellwatch/` は固定ルールの静的試作です。`main` のルートにはDecisions APIを使う別実装があり、作品全体を「API未実装」とは扱いません。実API成功・公開版稼働は未確認です。面白さと学習効果は設計目標で、利用者調査はこれからです。

```sh
cd cellwatch
npm run check
npm test
npm run dev
```

Node.jsとPython 3を使用。依存インストールとビルドは不要。ローカルURLは `http://127.0.0.1:8766/`。

## 他の試作とイベント

リポジトリ直下の `index.html`、`style.css`、`game.js` は別試作のPATCH / PANICです。[説明と起動方法](docs/patch-panic.md)。

[DevDay Community Hackathon公式案内・審査基準](https://luma.com/OpenAIDevDay2026CommunityHackathonTokyo)
