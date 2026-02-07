# Phase 5: Phase Vocoder & 高品質オプション

> 設計書参照: §10 Phase 5
> 前提: Phase 4 完了（play() API 統合が動作、WSOLA パスが完全動作）

## 完了基準

`algorithm: "phase-vocoder"` で 30 秒チャンクの変換が 500ms 以内。440Hz サイン波の精度が ±2Hz 以内。

---

## 5-1. Radix-4 FFT

**ファイル:** `src/workers/fft.ts`

Worker 内で動作する軽量 FFT。外部ライブラリ非依存。

### API

```ts
export class FFT {
  readonly size: number;

  /** @param size FFT サイズ（2 のべき乗） */
  constructor(size: number);

  /**
   * 順方向 FFT（時間領域 → 周波数領域）。in-place で上書き。
   * @param real 実部（長さ = size）
   * @param imag 虚部（長さ = size）
   */
  forward(real: Float32Array, imag: Float32Array): void;

  /**
   * 逆方向 FFT（周波数領域 → 時間領域）。in-place で上書き。
   * 1/N のスケーリングを含む。
   */
  inverse(real: Float32Array, imag: Float32Array): void;
}
```

### 実装方針

- **Radix-4** ベース（Radix-2 より約 25% 高速）
- サイズが 4 のべき乗でない場合は Radix-2 にフォールバック
- ビットリバーサルテーブルは constructor で事前計算
- 三角関数テーブルも事前計算（`cos`/`sin` の繰り返し呼び出しを回避）
- Worker 内で使うため `Float32Array` のみ対応（`Float64Array` は不要）

### テスト

```
- FFT サイズのバリデーション: 2のべき乗でなければ例外
- ラウンドトリップ: forward → inverse で元の信号を復元（誤差 < 1e-5）
- 既知の信号: 440Hz サイン波 → forward → ピーク周波数が 440Hz のビン
- DC 成分: 全サンプル = 1.0 → forward → real[0] = N, 他 = 0
- Parseval の定理: 時間領域のエネルギー ≈ 周波数領域のエネルギー
- 各サイズ: 256, 1024, 4096, 8192 で動作確認
```

---

## 5-2. Phase Vocoder + IPL

**ファイル:** `src/workers/phase-vocoder.ts`

### API

```ts
export interface PhaseVocoderOptions {
  fftSize?: number;        // @default 4096
  hopFactor?: number;      // @default 4（hopSize = fftSize / hopFactor）
}

/**
 * Phase Vocoder with Identity Phase Locking (IPL) による Time-Stretch。
 *
 * WSOLA より高品質だが約10倍遅い。
 * 音楽コンテンツや長い持続音に特に有効。
 *
 * @param input    チャンネルごとの入力サンプル
 * @param tempo    テンポ倍率
 * @param sampleRate サンプルレート
 * @param options  アルゴリズムパラメータ
 * @returns チャンネルごとの出力サンプル
 */
export function phaseVocoderStretch(
  input: Float32Array[],
  tempo: number,
  sampleRate: number,
  options?: PhaseVocoderOptions,
): Float32Array[];
```

### アルゴリズム詳細

1. **パラメータ:**
   - `fftSize = 4096`（オフラインなので大きな窓が使える）
   - `hopAnalysis = fftSize / 4 = 1024`
   - `hopSynthesis = Math.round(hopAnalysis * tempo)`
   - 窓関数: Hann window

2. **処理フロー:**
   ```
   入力フレーム → 窓関数適用 → FFT → 位相調整 → IFFT → 窓関数適用 → overlap-add
   ```

3. **位相調整（Phase Advancement）:**
   ```
   各ビン k について:
     instantaneous_frequency[k] = ω[k] + princarg(Δφ[k] - ω[k] * hopA) / hopA
     output_phase[k] = previous_output_phase[k] + instantaneous_frequency[k] * hopS
   ```

4. **Identity Phase Locking (IPL):**
   - 各ビンのピーク（局所的な振幅最大）を検出
   - ピークビンの位相補正をその周辺ビンにも伝播
   - これにより「フェイジー」な音質劣化を防止

5. **マルチチャンネル:**
   - チャンネル 0 で位相調整を計算
   - 他チャンネルには同じ位相シフトを適用（ステレオイメージを保持）

### 依存

- `src/workers/fft.ts` — FFT クラス

### テスト

WSOLA と共通のテストスイート + Phase Vocoder 固有テスト:
```
- 出力長: 440Hz × 1.5x → input.length / 1.5 ± 1%
- ピッチ精度: 440Hz × 1.5x → 出力ピーク周波数 440Hz ± 2Hz
- tempo 1.0 → 入出力がほぼ同一（RMS 差 < 閾値）
- ステレオ → チャンネル間の位相関係が保持されること
- WSOLA との品質比較: サイン波 + ノイズの混合信号 → PV の方が SNR が高い
```

---

## 5-3. アルゴリズム切替

**ファイル:** `src/workers/stretch-worker.ts`（変更）

### 変更内容

Worker 本体で `algorithm` パラメータに基づいて分岐:

```ts
case "convert": {
  const output = msg.algorithm === "phase-vocoder"
    ? phaseVocoderStretch(msg.inputData!, msg.tempo!, msg.sampleRate!)
    : wsolaStretch(msg.inputData!, msg.tempo!, msg.sampleRate!);

  // ... 結果を返す
}
```

### Worker インライン化の更新

Phase Vocoder コードを Worker に含める:

```ts
// worker-manager.ts
const workerCode = `${FFT_SOURCE}\n${PHASE_VOCODER_SOURCE}\n${WSOLA_SOURCE}\n${WORKER_SOURCE}`;
```

### ConversionEstimator の初期推定値

アルゴリズムによって初期推定値を変更:

```ts
const initialEstimateMs = algorithm === "phase-vocoder" ? 300 : 30;
const estimator = new ConversionEstimator({ initialEstimateMs });
```

---

## 5-4. 品質比較テスト

Phase Vocoder と WSOLA の品質を定量的に比較するテストハーネス。

### テストケース

| 信号 | 評価項目 |
|------|---------|
| 440Hz サイン波 | ピッチ精度（FFT ピーク） |
| ホワイトノイズ | スペクトル形状の保持 |
| サイン波 + ノイズ混合 | SNR 比較 |
| チャープ信号（周波数掃引） | 周波数追従性 |
| 無音 → トーン遷移 | トランジェント保持 |

### 合格基準

| 指標 | WSOLA | Phase Vocoder |
|------|-------|---------------|
| ピッチ精度 (440Hz, 1.5x) | ±5Hz | ±2Hz |
| 変換時間 (30秒チャンク) | ≤ 50ms | ≤ 500ms |
| 出力長精度 | ±1% | ±1% |

---

## Phase 5 の実装順序

```
19. src/workers/fft.ts                 ← 依存なし
    + tests/fft.test.ts
20. src/workers/phase-vocoder.ts       ← fft.ts に依存
    + tests/phase-vocoder.test.ts
21. src/workers/stretch-worker.ts 変更  ← phase-vocoder.ts に依存
22. Worker インライン化の更新            ← stretch-worker.ts に依存
23. 品質比較テスト                       ← 全アルゴリズム実装完了後
```

ステップ 19 → 20 → 21 → 22 は順序依存。
