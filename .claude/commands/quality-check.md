プロジェクト全体の品質チェックを順次実行し、結果をサマリーで報告してください。

以下の順序で実行:

1. `npm run typecheck` — TypeScript 型チェック
2. `npm run check` — Biome lint + format チェック
3. `npm run test:unit` — Node 単体テスト
4. `npm run test:browser` — ブラウザテスト

各ステップの結果を PASS / FAIL で報告し、FAIL の場合はエラー詳細を含めてください。
最後に全体サマリーを表示してください。
