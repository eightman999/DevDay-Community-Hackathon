# CELLWATCH プロジェクト

- 仕様は `spec.md`、学習内容は `textbook.md` を参照する。現在のユーザー指示を優先する。
- 静的配信は `dist/`。ビルド・依存のインストールは不要。
- `npm run check` と `npm test` が既存の検証コマンド。DOMスタブを実ブラウザ検証と呼ばない。
- HighLifeは `dist/automata.mjs`。見た目のコピー追加で自己複製を代用せず、12/36世代の検証を維持する。
- 判定と教科書の正解は `expectedVerdict`、理由は `verdictReason` を共有する。
- 既存Sites識別子を維持する。Sitesへのソース同期・公開はSitesスキルに従う。GitHubへのpushはユーザーが依頼した場合だけ。
- この `master/cellwatch/` の試作にはAPI、実攻撃、認証情報、個人データの取得は実装していない。ゲーム状態はメモリ内。別ブランチ `main` のルートにはDecisions API連携があるため、作品全体の技術状態は `FEATURES.md` と該当ブランチのソースを確認する。
