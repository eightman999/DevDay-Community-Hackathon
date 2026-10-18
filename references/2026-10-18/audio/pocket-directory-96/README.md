# Pocket Directory — 96 BPM

丸いPC内部の探索・擬態を想定した電子BGMです。4拍子・32小節・80秒、1拍30,000サンプル、1小節120,000サンプル。ループは48 kHzで `[0, 3840000)` サンプルです。

試聴: [通常](compressed/normal.m4a) / [警戒](compressed/suspicious.m4a) / [追跡](compressed/chase.m4a)

PCM: [通常ベース](stems/01_normal_base.wav) / [警戒の追加](stems/02_suspicion_add.wav) / [追跡の追加](stems/03_chase_add.wav)

3本を同じ音声クロック・開始時刻・再生位置で走らせます。通常はベースのみ、警戒はベース＋警戒、追跡は3本すべてをゲイン1で合成します。切替は次の拍から0.25秒程度のゲインランプを使います。完成ミックス同士を加算するとベースが重複します。

[metadata.json](metadata.json) / [全128拍](beat_grid.csv) / [楽譜イベント](score.json) / [生成コード](generate.py)

再生成はコピーした作業フォルダ内で `python generate.py` を実行します。Python 3とNumPyが必要で、既存FFmpegがあればM4Aも作ります。`--no-compressed` で圧縮を省略できます。生成はWAV・完成ミックス・内蔵試聴HTML・メタデータを更新します。プレーヤーの[テンプレート](tools/player.template.html)も同梱しています。今回は再作曲・再生成していません。

実聴・スマホ実機は未検証です。[来歴・配布条件・全体検証](../README.md)を確認してください。
