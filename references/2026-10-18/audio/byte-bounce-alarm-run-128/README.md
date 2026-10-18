# Byte Bounce: Alarm Run — 128 BPM

[30秒デモを試聴](compressed/ByteBounce_AlarmRun_128_demo.m4a) / [デモPCM](mixes/ByteBounce_AlarmRun_128_demo.wav)

| 秒 | 拍（0始まり、終端を含まない） | 内容 |
| --- | --- | --- |
| 0–3.750 | 0–8 | 通常 |
| 3.750–5.625 | 8–12 | 警報 |
| 5.625–7.500 | 12–16 | 4・3・2・1のカウント |
| 7.500–22.500 | 16–48 | 緊迫 |
| 22.500–26.250 | 48–56 | 成功 |
| 26.250–30.000 | 56–64 | 通常へ復帰 |

| 分離キュー | PCM | 試聴 | 長さ |
| --- | --- | --- | --- |
| 通常参考 | [WAV](audio/ByteBounce_Normal_128_context_2bars.wav) | [M4A](compressed/ByteBounce_Normal_128_context_2bars.m4a) | 8拍 / 3.750秒 |
| 警報 | [WAV](audio/ByteBounce_Alarm_128_oneshot.wav) | [M4A](compressed/ByteBounce_Alarm_128_oneshot.m4a) | 4拍 / 1.875秒 |
| カウント | [WAV](audio/ByteBounce_Countdown_128_4beats.wav) | [M4A](compressed/ByteBounce_Countdown_128_4beats.m4a) | 4拍 / 1.875秒 |
| 緊迫 | [WAV](audio/ByteBounce_Tension_128_loop_8bars.wav) | [M4A](compressed/ByteBounce_Tension_128_loop_8bars.m4a) | 32拍 / 15秒 |
| 成功 | [WAV](audio/ByteBounce_Success_128_jingle.wav) | [M4A](compressed/ByteBounce_Success_128_jingle.m4a) | 8拍 / 3.750秒 |

1拍は0.46875秒・22,500サンプルです。通常ループは `[0, 180000)`、緊迫ループは `[0, 720000)` サンプル。警報・カウント・成功はワンショット、30秒デモも完結型です。カウントの主音は0・22,500・45,000・67,500、締切は90,000サンプルです。カウントに声は使っていません。

緊迫音源はドラム・低音・和音込みの完成BGMなので、元の60秒曲を下げて切り替えます。同じ128 BPMでも、任意の位置で和音が一致する設計ではありません。デモの通常部分は元曲冒頭モチーフの2小節版です。成功時は緊迫を0.25拍でフェードします。

[メタデータと切替情報](metadata.json) / [拍グリッド](beat_grid.csv) / [楽譜イベント](score.json) / [生成コード](generate.py) / [元曲の合成基礎](tools/byte_bounce_core.py)

コピーした作業フォルダで `python generate.py` を実行します。Python 3・NumPyを使い、既存FFmpegがあればM4Aも生成します。`--no-compressed` で圧縮を省略できます。今回は最新の `ByteBounce_AlarmRun_128_v1.zip` の同梱ファイルと照合しており、再作曲・再生成はしていません。

実在の警報録音・旋律、第三者サンプルは入力していません。実聴・スマホ実機は未検証です。[来歴・配布条件・全体検証](../README.md)を確認してください。
