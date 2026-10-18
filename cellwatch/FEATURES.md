# CELLWATCH — DevDay機能利用の根拠

2026-10-18確認。目的は、使った技術を公式発表と照合し、実装済みと構想を区別することです。採点結果を予測・保証する資料ではありません。

## 確認できたこと

| 技術・機能 | 公式情報 | CELLWATCHの状態 |
| --- | --- | --- |
| SitesによるWeb公開 | [2026年6月1〜5日の更新](https://learn.chatgpt.com/docs/whats-new)に作成・配信機能の記載あり | [公開URL](https://cellwatch-inspection.eightman.chatgpt.site/)と[hosting.json](.openai/hosting.json)で確認。配信の用途は実証できるが、9月のDevDay新機能という根拠にはならない |
| Sites with connected data | [DevDay 2026](https://learn.chatgpt.com/docs/whats-new/devday-2026)では、訪問者の接続アプリを利用する機能として紹介 | 現行の静的ゲームには接続アプリ利用の実装なし |
| Website annotations | [DevDay 2026](https://learn.chatgpt.com/docs/whats-new/devday-2026)の項目。[公式開発ガイド](https://learn.chatgpt.com/docs/annotations-extensibility)で選択対象や文脈のカスタマイズを説明 | 現行CELLWATCHには独自のannotation連携なし。ブラウザ標準の注釈操作と作品側の実装は区別する |
| モデル/API利用 | 特定のモデルやAPIを使ったという主張には、呼び出しコードと実行記録が必要 | 現行ゲームは固定ロジック。ゲーム中の呼び出しなし。開発時のモデル名・モードはソースから確定できない |

照合対象は `dist/app.mjs`、`dist/engine.mjs`、`dist/automata.mjs`、`dist/index.html`、`package.json`、`.openai/hosting.json`。名前の出現だけでなく、処理と構成を確認しています。

## 作品の目的に合う追加候補（未実装）

Website annotationsで「自分が間違えた申請と判断理由」を相談に添付する案が考えられます。プレイヤーが状態を説明し直さずに、失敗の振り返りへ進めることを目的にします。ゲームの正解は固定ルールとして保ち、AIの説明とは区別します。

これは設計候補です。審査資料では、次の条件が揃うまで利用実績として書きません。

1. 対象環境で機能を検出し、非対応環境でも教科書で学べる。
2. プレイヤーの明示操作で、架空の申請・判断・正解など必要な状態だけを添付する。
3. 相談画面で添付内容を確認でき、実際の利用デモを記録する。
4. 公開ソース・公開サイト・作品概要を同じ状態に更新する。

既存作品の面白さと学びを優先し、機能名を増やすこと自体を目的にしません。
