# CELLWATCH Sites Worker

ゲーム画面の正本はルートの `dist/`。`prepare.mjs` が `public/` へコピーし、既存HTML/CSS/画像をそのまま配信します。`dist/{server,client,.openai}` はビルド生成物なのでコピー対象外です。Vinext の `sites()` ビルド統合を維持しています。

ルートから `npm run build` で Worker と静的ファイルを生成し、公開用 `dist/{server,client,.openai}` へ配置します。Sites のソース同期と公開はルート checkout を使います。Site ID はルートと `sites/.openai/hosting.json` で同じ値を維持します。

## API

- `GET /api/enemy/status`: 現在のモード。認証が必要な場合は `signInRequired: true`。
- `POST /api/enemy/decide`: `{sessionId, turn}` を共通の `server/decision-service.mjs` へ渡します。同一originのJSONリクエストのみ、本文最大32KiB。上流APIには3.2秒の期限、失敗時はローカル選択。
- `POST /api/companion/message`: `{sessionId, requestId, kind, context}` を共通の `server/companion-service.mjs` へ渡します。`kind` は `consult` / `review`。判定前の正解を除いた観測を検証し、Agentsの返答または理由付きの定型応答を返します。
- CSVは `build/cellwatch-data.ts` でビルド時にWorkerへ埋め込みます。ブラウザ用CSVと同じ正本を使用し、実行時ファイル読み込みはしません。

## 設定と費用境界

既定は匿名で遊べるローカル選択です。外部API呼び出しは `ENEMY_AI_ENABLED=true` と `OPENAI_API_KEY` の両方がある場合だけ有効になります。Decisionsを明示的に有効にする設定は `ENEMY_MODE=decisions`、相棒の設定は `COMPANION_AI_ENABLED=true` と同じ `OPENAI_API_KEY` です。`ENEMY_MODE=local` で敵を強制的にローカルへ戻せます。キーはSitesのruntime secretに置き、ソースやmanifestへ書きません。

AIモードはSitesが検証したChatGPT利用者IDを必要とします。未ログインの直接POSTは401になり、画面側はローカルへ切り替わります。サインイン導線はSites標準の `/signin-with-chatgpt?return_to=%2F` を使用します。

共通サービスの上限はisolateあたりDecisions 64回・Agents 32回。Decisionsは当直あたり通信数まで、相棒は相談5回・終了時review 1回で、一時的なsessionキャッシュの保持は15分です。いずれもプロセス単位の保護です。isolate増設や再起動をまたぐサイト全体の課金上限ではありません。本番有効化時にはこの制限範囲を考慮し、必要に応じて永続する予算管理やプロジェクト側の費用管理を併用します。

相棒はメッセージごとにAgentsのhosted sessionを作成し、応答処理後に削除します。削除に失敗した場合はサーバー側に記録します。当直履歴と直近3件の通信表示はブラウザのメモリ内に保持し、プレイヤー履歴を永続保存しません。相談時は定型ヒントを即表示し、AI待ちでもゲームを進めます。終了時には良かった点・見直す点・次の当直で試すことを自動で振り返ります。

Decisionsの先読みは次の投入の4秒前、サーバー期限3.2秒・ブラウザのHTTP待ち3.6秒・director期限3.8秒です。期限後の回答で投入を遅らせません。

今回作成したキーの有効期間は7日です。永続的な自動稼働には更新が必要です。実API単発の成功は確認済みですが、Sites本番は配信・動作確認中です。

## ローカル

Sitesスキルの `install-dependencies.mjs` で依存を準備後、`npm --prefix sites run dev`。組み込みSites認証のモックはloopback限定です。本番用ヘッダーをブラウザから付与する実装はありません。`npm --prefix sites run start` はビルド済みWorkerをWranglerでローカル起動します。

自動サポートは `POST /api/companion/message` の `kind: support` で、許可された隔離/修復/waitから1件を選びます。実行直前にブラウザで再検証し、判定操作や採点は変更しません。最大6回/当直、相談5回、振り返り1回です。
