# DevDay Community Hackathon — BEAT BORDER / MIMIC

新しい試作 **BEAT BORDER**：データの中身を読み、拍に合わせて「許可・拒否・保留」を押す30秒のリズム検査ゲーム。

- **[BEAT BORDERを遊ぶ](https://mimic-octopus-1018.morita-shibu5.chatgpt.site/beat-border/)**
- [試作のソース・起動・検証](beat-border/README.md)

個人情報は拒否、中身が読めなければ保留、それ以外は許可。途中の通達で .exe も拒否になります。現在の試作は固定ルールで動作し、Decisions API / Sites MCP はまだ接続していません。

既存のMIMICは、色・形・リズムを合わせて90秒生き残る3D擬態ゲームです。

- [公開ゲーム](https://mimic-octopus-1018.morita-shibu5.chatgpt.site)
- [DevDay新機能の活用とデモ説明](https://mimic-octopus-1018.morita-shibu5.chatgpt.site/devday.html)
- [実装・起動・検証記録](mimic-octopus/README.md)
- [イベントルール](https://luma.com/OpenAIDevDay2026CommunityHackathonTokyo)

## 今回使う新機能

DevDay 2026のWebsite annotationsで、その瞬間のゲーム状態をChatGPTへの攻略相談に添付します。周期・位相差まで記録できるため、画像だけでは説明しにくいリズムのずれを伝えられます。
ゲーム本体の判定は固定ロジックです。ゲーム内でAIモデルを動かしているという主張はしません。

## 参加条件の確認事項

午前に公開した初版をベースにしています。事前プロトタイプの未公開条件との整合は主催者への確認が必要です。


## BEAT BORDER — 音ゲー × 入国審査のコンセプト

書類を読み、許可・拒否・追加検査を選び、拍に合わせて判子を押すゲーム案です。
16秒・120 BPM・音付きのモック動画を作りました。

[![BEAT BORDER コンセプト動画](media/beat-border-preview.png)](media/beat-border-concept.mp4)

[動画ファイルを開く・ダウンロード](media/beat-border-concept.mp4)

この映像は実装前のコンセプトアニメーションです。Sites MCPによる管制操作、Decisions APIによる追加検査は今後の構想であり、この動画では接続していません。
