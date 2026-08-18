import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 這會讓 `describe`, `it`, `expect` 等 API 成為全域變數，
    // 您就不需要在每個測試檔案中手動 import。
    globals: true,
    // 如果您有需要在所有測試前執行的設定檔 (例如，連接測試資料庫)，可以在這裡指定。
    // setupFiles: './src/test/setup.ts',
  },
});