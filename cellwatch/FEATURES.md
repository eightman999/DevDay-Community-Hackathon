# CELLWATCH — DevDay技術の役割と採用方針

更新: 2026-10-18。**完成形に向けて、DevDay関連技術をどの体験へつなげるか、採用方針を整理します。** ゲームの楽しさを優先し、学びは最後に少し触れられるという[企画方針](CONCEPT.md)を軸にします。実装や動作の確認結果は、後半の参照情報と[検証記録](VERIFICATION.md)へまとめます。

## 制作工程とゲーム実行中の両方で技術を使う

**ゲームで使う音楽をDotsで制作中です。完成した楽曲をゲーム内BGMとして採用する予定です。** 作品を動かすAPI連携と、音楽などの素材をつくる制作工程の両方で、DevDay技術を活用します。

Dotsは音楽制作とレビューを担うエージェントとして採用します。完成曲を作品の雰囲気や演出につなげ、レビューの指摘や気づきを改善へ活かします。技術資料では、目指す体験と採用方針を先に示し、制作・実装の記録は進行に合わせて補います。

## 技術ごとの役割と状態

| 技術 | 作品を支える役割 | 状態と審査へ示す根拠 |
| --- | --- | --- |
| **Dots：音楽制作** | 音楽を制作し、ゲーム内BGMとして作品の雰囲気や演出を支える | **制作中・完成曲を採用予定**。具体的な曲名や使用場面は、制作と組込みに合わせて整理する |
| **Dots：レビュー** | レビューを担い、指摘や気づきを次の改善につなげる | **採用方針を決定**。レビューの対象と使い方を具体化していく |
| **Decisions API** | プレイヤーの防御状況と直近の審査を受け、用意した候補から次の通信を選ぶ。遊びに変化をつくる | **mainに接続コードあり**。下記の実装経路を参照。実API成功記録と公開稼働は未確認 |
| **MCP Events** | ゲームの重要な変化や終了を、購読したChatGPT側の相棒へ届ける | **優先する技術方針・接続は未確認**。購読→実イベント配送→受信先の応答までを証拠にする。ブラウザのクリックイベントとは別 |
| **Agents API** | ゲーム状況や履歴を受け、相棒の対応・演出・最後の短いまとめなどを実行する候補 | **優先する技術方針・接続は未確認**。用途とセッション作成・対象ターンの完了・出力とツール結果・ゲームへの反映を示す。Agents SDKやDecisions APIと区別する |
| Sites | ゲームをWebで遊べるように配信する | 公開先と[設定](.openai/hosting.json)あり。技術の実行経路と公開UIがつながっているかは別に確認する |

MCP Events／Agents APIの用途は、画面に依存しない設計候補です。採用する役割と接続経路を確定し、実装・実行の根拠を揃えてから「使用済み」と記載します。

## Dotsによる音楽制作の記録

Dotsでゲーム用の音楽を制作し、完成した楽曲をCELLWATCHのBGMとして採用します。現在は制作中で、作品の雰囲気や演出に合う形へ仕上げていく計画です。曲名や使用場面は、制作・組込みの進行に合わせて具体化します。

紹介文では「Dotsを音楽制作に活用し、完成曲をゲーム内BGMに採用予定」と説明します。制作工程とゲーム体験のつながりを示し、楽曲の完成・組込み後に試聴や再生の記録を添えます。

Dotsの公式な位置づけは[DevDay 2026公式まとめ](https://learn.chatgpt.com/docs/whats-new/devday-2026)と[Meet dots](https://learn.chatgpt.com/docs/dots)を参照してください。

## Dotsによるレビュー

レビュー担当としてDotsを採用します。音楽制作と合わせて、制作・体験・改善の流れでDotsを活用する方針です。レビューで得た指摘や気づきを、次の改善へつなげます。

Dotsの採用と、MCP Events／Agents APIの接続設計は、それぞれの役割として整理します。レビューにDotsを使うこと自体を、これらのAPIとの連携完了としては扱いません。

## MCP EventsとAgents APIをつなぐ場合の設計候補

二つの技術は役割が異なります。公式の[MCP Events](https://developers.openai.com/plugins/build/mcp-events)は、ChatGPTがMCPサーバーのイベントを購読する仕組みです。MCP 2.0、購読の保存、署名付きHTTPS callbackなどが必要で、対象のWork環境も確認します。

[Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview)は、OpenAI管理のCodex harnessをアプリから使うためのAPIです。セッションの入力・出力イベントはMCP Eventsの購読通知とは別です。

例えば、アプリ側で次の二経路を設計できます。

```text
ゲームの節目 → アプリ側の連携処理 → Agents API → 演出・短いまとめ → ゲームへ反映
ゲームの節目／まとめの完成 → MCPサーバー → MCP Events → 購読したChatGPTで応答
```

これは接続案で、公式にMCP EventsからAgents APIへ自動直結するという意味ではありません。橋渡しはCELLWATCH側で実装します。ゲームの短い時間制限に対するAPIの待ち時間と、ChatGPT側の非同期処理も分けて設計します。

ゲーム状況に応じた相棒や演出を使う場合も、専門用語の暗記や11種の再現を攻略条件にする必要はありません。最後のまとめを使う場合は、[学びの題材](LEARNING-TOPICS.md)から必要なものだけ短く添える候補とします。

## 実装の参照情報

| 対象 | 今回確認した内容 |
| --- | --- |
| `master/cellwatch/` | これまで文書とテストが参照していた、静的な汎用システム版。ゲーム中のモデルAPI呼び出しはこの範囲では確認されていない |
| `main` のルート | [実装基準 be363242](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/README.md)。`server.mjs` と `dist/enemy-provider.mjs` にDecisions APIの適応敵連携がある |
| MCP Events／Agents API | 確認したブランチ・ソースでは接続コードを確認できていない。技術方針として優先し、実装の所在が追加で分かったら根拠を追記する |
| 公開サイト | [既存URL](https://cellwatch-inspection.eightman.chatgpt.site/)の配信コミットとAPI稼働は未確認。静的配信ではローカル選択へ切り替わるため、遊べることだけではAPI利用の証拠にならない |

従来の「モデルAPI未実装」という記述は `master/cellwatch/` の確認結果であり、作品全体への断定としては不正確でした。`main` にある実装を技術の証拠として記録します。`main` では11種類の弱点をゲーム規則に取り込む実装も進んでおり、最新の「11種は最後の学びの題材」という方針との差があります。ここでは技術の所在を記録し、画面やルールの採用を確定しません。

## 既存のDecisions連携を説明する

実装基準: [`main@be3632425341f5a4afda03275744bb620b47282c`](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/README.md)。

```text
ゲームの状態・候補
  → /api/enemy/decide
  → サーバーがDecisions APIのchoiceへ問い合わせ
  → 候補内のIDかを検査
  → 次の通信としてゲームへ反映
```

| 根拠 | 確認できること |
| --- | --- |
| [enemy-provider.mjs:23](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/dist/enemy-provider.mjs#L23) | ブラウザからアプリのAPIへ問い合わせる |
| [server.mjs:79](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/server.mjs#L79) | `POST /v1/decisions`、`gpt-6-luna`、`choice`で候補を選ぶ |
| [server.mjs:42](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/server.mjs#L42) | 未知の候補や不正な応答を受け付けない |
| [server.mjs:65](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/server.mjs#L65) | サーバー側の期限を設け、失敗・遅延時はローカルで継続する |
| [server.test.mjs](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/server.test.mjs) | APIを差し替えて確認するテストが存在する。今回は再実行していない |
| [main README:69](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/README.md#L69) | 実APIの課金呼び出しは未実施と記載。モックの成功を実API成功として扱わない |
| [main README:60](https://github.com/eightman999/DevDay-Community-Hackathon/blob/be3632425341f5a4afda03275744bb620b47282c/README.md#L60) | この実装の既存公開サイトへの同期・公開は未実施と記載 |

正解と被害量はゲーム側が保持し、APIは次の候補を選びます。[Decisionsの公式仕様](https://developers.openai.com/api/docs/guides/decisions)も、候補選択などの型付き判断を返すAPIとして説明しています。

## DevDayとの対応を正確に示す

| 根拠資料 | 確認できること |
| --- | --- |
| [DevDay 2026公式まとめ](https://learn.chatgpt.com/docs/whats-new/devday-2026) | 2026-09-29の項目にDotsとMCP Eventsを明記。Dotsは音楽制作とレビューの役割で説明する |
| [公式API Changelog](https://developers.openai.com/api/docs/changelog) | Agents API本体の公開betaは2026-09-10。2026-09-29の追加はAgents APIのcomputer use |
| [Agents APIとSDKの比較](https://developers.openai.com/api/docs/guides/agents) | 管理されたAPIと、アプリ内でループを動かすSDKは異なる |

Agents APIを使うことだけで「DevDay当日に発表された新機能を使った」とは断定しません。該当する追加機能と利用箇所を示します。computer useを採用するかは未決で、技術名を増やす目的で追加しません。Decisionsも公式仕様・実装・実利用記録を対応づけます。

Website annotationsや接続データを使うSitesも追加候補にはなりますが、MCP Events／Agents APIの活用説明の代わりにはしません。通常のSites公開だけで新機能活用を説明しきる構成も避けます。

## 審査へ提出する技術の証拠

| 項目 | 残す内容 |
| --- | --- |
| 利用目的 | その技術がゲーム体験の何を支えるか |
| ソース・制作物 | ブランチ、完全なコミットSHA、呼び出し箇所。Dotsによる素材制作は、制作記録と出力・採用箇所を対応づける |
| 接続の実行 | 実APIの要求・応答、MCP購読と配送・受信、Agentsの対象ターンの完了と出力・ツール結果など。秘密を除いた識別子と時刻を記録 |
| 体験への反映 | 結果が次の展開・相棒・まとめに反映される再現手順 |
| 公開版 | 実際の配信URLと版、APIが使われたこととローカル継続の区別 |

画面の見栄え、コードがあること、モック検証、実API成功、公開版の動作はそれぞれ別の根拠です。最新の審査対応は[REVIEW](REVIEW.md)、残作業は[READINESS](READINESS.md)に反映します。
