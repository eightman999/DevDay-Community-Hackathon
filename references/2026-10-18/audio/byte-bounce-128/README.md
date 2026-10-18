# Byte Bounce — 128 BPM

弾む四つ打ちと短い電子マレットのBGMです。4拍子・32小節・60秒、Dメジャー中心。1拍22,500サンプル、1小節90,000サンプル。ループは48 kHzで `[0, 2880000)` サンプルです。

試聴: [通常](compressed/ByteBounce_128_normal.m4a) / [警戒](compressed/ByteBounce_128_suspicious.m4a) / [追跡](compressed/ByteBounce_128_chase.m4a)

PCM: [通常グルーヴ](stems/01_normal_groove.wav) / [警戒の追加](stems/02_suspicion_ticks.wav) / [追跡の追加](stems/03_chase_drive.wav)

通常はstem 1、警戒は1＋2、追跡は1＋2＋3をゲイン1で合成します。3本を同じ音声クロック・開始時刻・再生位置で走らせ、次の拍から0.25秒程度で追加stemのゲインを変えます。全stemに共通のマスターゲインを使い、個別ノーマライズは避けます。

[metadata.json](metadata.json) / [全128拍](beat_grid.csv) / [楽譜イベント](score.json) / [生成コード](generate.py)

コピーした作業フォルダで `python generate.py` を実行すると、Python 3・NumPyでWAV・完成ミックス・試聴HTMLを作ります。既存FFmpegがあればM4Aも作ります。`--no-compressed` で圧縮を省略できます。[プレーヤーテンプレート](tools/player.template.html)を同梱しています。今回は再作曲・再生成していません。

実聴・スマホ実機は未検証です。[来歴・配布条件・全体検証](../README.md)を確認してください。
