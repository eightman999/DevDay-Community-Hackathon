# CELLWATCH Sites Worker

ゲーム画面の正本はルートの `dist/`。`prepare.mjs` が `public/` へコピーし、既存HTML/CSS/画像をそのまま配信します。`dist/{server,client,.openai}` はビルド生成物なのでコピー対象外です。Vinext の `sites()` ビルド統合を維持しています。

ルートから `npm run build` で Worker と静的ファイルを生成し、公開用 `dist/{server,client,.openai}` へ配置します。Sites のソース同期と公開はルート checkout を使います。Site ID はルートと `sites/.openai/hosting.json` で同じ値を維持します。

## API

- `GET /api/enemy/status`: 現在のモード。認証が必要な場合は `signInRequired: true`。
- `POST /api/enemy/decide`: `{sessionId, turn}` を共通の `server/decision-service.mjs` へ渡します。同一originのJSONリクエストのみ、本文最大32KiB。上流APIには1.2秒の期限、失敗時はローカル選択。
- CSVは `build/cellwatch-data.ts` でビルド時にWorkerへ埋め込みます。ブラウザ用CSVと同じ正本を使用し、実行時ファイル読み込みはしません。

## 設定と費用境界

既定は匿名で遊べるローカル選択です。外部API呼び出しは `ENEMY_AI_ENABLED=true` と `OPENAI_API_KEY` の両方がある場合だけ有効になります。`ENEMY_MODE=local` で強制的にローカルへ戻せます。キーはSitesのruntime secretに置き、ソースやmanifestへ書きません。

AIモードはSitesが検証したChatGPT利用者IDを必要とします。未ログインの直接POSTは401になり、画面側はローカルへ切り替わります。サインイン導線はSites標準の `/signin-with-chatgpt?return_to=%2F` を使用します。

共通サービスの上限（isolateあたり64回、sessionあたり通信数まで、session保持15分）はプロセス単位の保護です。isolate増設や再起動をまたぐサイト全体の課金上限ではありません。本番有効化時にはこの制限範囲を考慮し、必要に応じて永続する予算管理やプロジェクト側の費用管理を併用します。

## ローカル

Sitesスキルの `install-dependencies.mjs` で依存を準備後、`npm --prefix sites run dev`。組み込みSites認証のモックはloopback限定です。本番用ヘッダーをブラウザから付与する実装はありません。`npm --prefix sites run start` はビルド済みWorkerをWranglerでローカル起動します。
