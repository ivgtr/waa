# waa-play

[![npm version](https://img.shields.io/npm/v/waa-play)](https://www.npmjs.com/package/waa-play)

Web Audio API modules with WSOLA time-stretching, chunk-based streaming, and waveform extraction

waa-play は Web Audio API を用いた音声操作のためのモジュール群です。ピッチ保持タイムストレッチ、ストリーミング再生、波形抽出、AudioNode チェーン接続などの機能を提供します。

Web Audio API の `playbackRate` で再生速度を変更するとピッチも連動して変化します。waa-play は、ピッチを保持したまま再生速度を変えたいユースケースのために作成しました。

この実装は完璧なものではなく、すべてのユースケースに対応するわけではないことに注意してください。

## Documentation & Demo

https://ivgtr.github.io/waa/

## ピッチ保持タイムストレッチ（WSOLA）

waa-play は WSOLA (Waveform Similarity Overlap-Add) アルゴリズムを採用しています。
音声信号を小さなフレームに分割し、類似した波形を重ね合わせて再構築することで、ピッチを変えずに時間的な伸縮を実現します。

HTML5 Audio 要素の `preservePitch` オプションと同様の効果を目指していますが、いくつかの制約があります。
WSOLA の処理はクライアントサイドで行われるため、CPU リソースを多く消費する可能性があります。
また、AudioBuffer 全体を事前に読み込む必要があるため、長い音声ファイルでは変換に時間がかかる場合があります。

これらの制約に対して、Worker による並列処理やチャンクベースのストリーミングで対処しています。

### Worker ベースの変換

WSOLA 変換は Web Worker 内で実行され、メインスレッドのパフォーマンスへの影響を最小限に抑えています。
Worker は複数生成され、変換タスクがキューイングされて効率的に処理されます。

### チャンクベースのストリーミング再生

変換済みの音声がチャンク単位で順次再生されます。
これにより、長時間の音声でもすべての変換を待つことなく、スムーズな再生が可能です。

### イベント通知

再生位置の更新や再生終了などのイベントが通知され、UI の更新や他の処理に利用できます。

## Quick Start

```bash
npm install waa-play
```

### 最も簡単な使い方（WaaPlayer）

`WaaPlayer` が `AudioContext` を内部管理し、全モジュールの機能を統合して提供します。

```ts
import { WaaPlayer } from "waa-play";

const player = new WaaPlayer();
const buffer = await player.load("/audio/track.mp3");

const gain = player.createGain(0.8);
const playback = player.play(buffer, { through: [gain] }); // 再生

playback.setPlaybackRate(1.5); // 再生速度を 1.5 倍に変更（リアルタイム反映）

playback.on("timeupdate", ({ position, duration }) => {
  console.log(`${position.toFixed(2)}s / ${duration.toFixed(2)}s`);
});

playback.dispose(); // 再生停止・リソース解放
```

既存の `AudioContext` を渡すこともできます。これは例えば、他の AudioNode と接続したい場合に有用です。

```ts
const player = new WaaPlayer(existingAudioContext);
```

## License

MIT © [ivgtr](https://github.com/ivgtr)

[![Twitter Follow](https://img.shields.io/twitter/follow/ivgtr?style=social)](https://twitter.com/ivgtr) [![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
