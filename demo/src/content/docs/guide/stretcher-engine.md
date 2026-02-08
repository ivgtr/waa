---
title: Stretcher Engine
description: Stretcher モジュールの 3 層アーキテクチャと設計判断
---

Stretcher モジュールはピッチを保持したままテンポを変更する time-stretch 機能を提供します。内部は **3 つの独立した機能層** で構成されています。

```
┌─────────────────────────────────────────────┐
│              play() 統合層                    │
│         createStretchedPlayback()            │
├──────────┬──────────────┬───────────────────┤
│  Engine  │ Chunk Buffer │  Status Manager   │
│  (WSOLA) │  (分割/再生)  │  (Phase/Health)   │
├──────────┴──────────────┴───────────────────┤
│          Worker Pool / Fallback              │
└─────────────────────────────────────────────┘
```

- **Engine** — WSOLA アルゴリズムによる time-stretch 処理（本ページ）
- **Chunk Buffering** — チャンク分割・優先度変換・ダブルバッファリング再生（→ [Chunk Buffering](/waa/guide/chunk-buffering/)）
- **Status Management** — Phase 遷移・Buffer Health・イベント管理（→ [Status Management](/waa/guide/status-management/)）

## WSOLA アルゴリズム

WSOLA（Waveform Similarity Overlap-Add）は、波形の類似性に基づいてオーディオフレームを重ね合わせることで、ピッチを変えずに再生速度を変更するアルゴリズムです。

入力音声を固定サイズのフレームに分割し、各フレームを overlap-add で出力バッファに合成します。入力側の読み取り間隔を変えることで、出力の伸縮を実現します。

### synthesisHop の固定とピッチ保持

time-stretch で最も重要な設計判断は、**出力側の間隔（synthesisHop）を固定し、入力側の間隔（analysisHop）をテンポに依存させる**ことです。

```
synthesisHop = 固定値                ← 出力は常に一定間隔で合成
analysisHop  = synthesisHop × tempo  ← 入力の読み取り間隔を変える
```

- **スロー再生**: analysisHop が小さくなり、入力を密に読むので出力が伸びる
- **等速再生**: analysisHop = synthesisHop で入出力が一致
- **高速再生**: analysisHop が大きくなり、入力を粗く読むので出力が縮む

逆に synthesisHop を可変にすると、出力フレームの間隔が変わるため周波数がずれ、ピッチが変化してしまいます。synthesisHop を固定することで、出力の周波数構造が保たれます。

### 正規化相互相関（NCC）による位置探索

各フレームの最適な読み取り位置を探すために、前回の出力フレームと入力バッファの候補位置との**相互相関**を計算します。相関が最大になる位置でフレームを取り出すことで、波形の連続性が保たれ、アーティファクトが最小化されます。

ここで単純な相互相関ではなく**正規化相互相関（NCC）** を使う理由は、**振幅差に頑健**であるためです。音量が急に変わる箇所（フェードイン・アウト、ダイナミクスの変化）でも、正規化により波形の「形」だけを比較できるため、安定した位置探索が可能になります。

## Worker Pool による並列処理

WSOLA の計算は CPU 負荷が高く、メインスレッドで実行するとオーディオの再生や UI 操作がブロックされます。Web Worker で別スレッドに逃がすことで、メインスレッドの応答性を保ちます。

複数の Worker をプールとして管理し、チャンクの変換リクエストを空いている Worker に振り分けます。

### Inline Worker（Blob URL）方式

一般的な Worker の使い方では外部の `.js` ファイルを参照しますが、これにはバンドラーの設定（webpack の `worker-loader`、Vite の `?worker` クエリなど）が必要で、ライブラリの利用者に設定の負担を強います。

Stretcher では Worker コードを JavaScript 文字列としてバンドルに含め、Blob URL で Worker を生成します。これにより：

- バンドラー設定が一切不要
- 外部ファイルの配信パス設定が不要
- ライブラリを `npm install` するだけで動作する

### メインスレッド Fallback

すべての環境で Worker が使えるわけではありません。

- **厳格な CSP**: `worker-src` や `blob:` が許可されていない環境では Blob URL Worker を生成できない
- **Worker クラッシュ**: Worker が繰り返しクラッシュした場合のリカバリ

これらの場合にメインスレッドで WSOLA を実行する Fallback を用意しています。並列度は下がりますが、機能が完全に停止することはありません。

## play() との統合

`play()` に `preservePitch: true` を渡すと、内部で Stretcher Engine が dynamic import されます。通常の `play()` と同じインターフェースで time-stretch 再生を利用できるため、利用者は内部のチャンク管理や Worker 制御を意識する必要がありません。
