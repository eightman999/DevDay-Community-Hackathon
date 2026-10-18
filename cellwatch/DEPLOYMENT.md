# CELLWATCH — 既存サイトへの公開反映

## 現在の状態

- GitHubの審査資料は [PR #5](https://github.com/eightman999/DevDay-Community-Hackathon/pull/5) をmasterへ反映済み。
- 公開ゲーム: https://cellwatch-inspection.eightman.chatgpt.site/
- 既存プロジェクトID: `appgprj_6ad455bba7c0819184d33620f2014919`
- 配信元ディレクトリ: `cellwatch/dist/`。設定の正本は [hosting.json](.openai/hosting.json)。
- この作業のSites接続では `get_site` が `NOT_FOUND` を返し、更新に進めない。サイトが公開閲覧できることは、編集権限を持つことを意味しない。アカウント・ワークスペースの不一致や編集権限不足などの原因は未確定。
- 新しい説明ページ `about.html` とゲームからのリンクは公開用ソースに追加済み。本番配信は未確認。

## 反映する人が行うこと

1. 既存サイトを編集できるアカウント／ワークスペースでSitesに接続し、上記IDの `get_site` が成功することを確認する。既存の公開範囲を保持する。
2. Sitesスキルの既存サイト更新手順で最新ソースを取得する。GitHubのmasterと比較し、別の開発者によるゲーム更新を保持する。GitHubの古い `dist/` で最新公開版を丸ごと上書きしない。
3. この整理で加わった `dist/about.html`、`dist/index.html` のdescriptionとフッターリンク、`dist/style.css` の `.aboutlink` を取り込む。README・仕様・検証文書もソース側に保持する。
4. `cellwatch/` で `npm run check` と `npm test` を実行し、ローカルでゲーム開始と説明ページの往復を確認する。
5. Sitesのソース同期・保存・配信を実行する。公開範囲とプロジェクトIDは変更しない。成功したコミット／保存バージョン／配信URLを記録する。
6. 公開トップから「作品の目的・遊び方・検証」リンクを開けること、`/about.html` が表示されること、ゲーム開始・教科書・リセットを確認する。
7. [準備状況](READINESS.md)と[検証記録](VERIFICATION.md)の公開状態を更新する。

GitHubのマージだけではSitesに自動配信されたことを意味しません。新規サイトを作ってURLを差し替えることも、この更新の代わりにはしません。

## 公開後に残す記録

| 項目 | 記録する値 |
| --- | --- |
| 取り込んだGitHubコミット | 完全なSHA |
| Sitesのソースコミットと保存バージョン | Sitesの返却値 |
| 配信先 | 実際に配信されたURL |
| 確認日時 | 日本時間で記載 |
| 操作結果 | 説明ページ、開始、教科書、リセットの結果 |

未実施の値は推測で埋めません。
