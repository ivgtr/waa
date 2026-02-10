引数で指定されたモジュール（$ARGUMENTS）のテスト不足箇所を特定し、テストを追加してください。

## 手順

1. `src/$ARGUMENTS` のソースを読み、公開関数・分岐・エッジケースを列挙
2. `tests/` 配下の既存テストを読み、カバーされていない箇所を特定
3. `tests/helpers/audio-mocks.ts` の共通モックを活用してテストを追加
4. 追加したテストを `npx vitest run` で実行して PASS を確認

## テスト方針

- 純粋関数 → 入出力のみ検証
- コンポーネント → audio-mocks.ts のモックを使用
- Race condition → タイマー + コールバックが絡む箇所には 3 パターン（CB先行, dispose前, 連続呼び出し）を検証
- `vi.useFakeTimers()` は動的 `import()` をブロックするため stretched playback テストでは使わない
- Worker モックは `function` キーワード必須
