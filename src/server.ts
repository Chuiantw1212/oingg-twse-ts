import app from './app';

// 注意：在生產環境中，環境變數應由 Cloud Run (或 Secret Manager) 提供
const port = Number(process.env.PORT) || 8080; // Cloud Run 預設為 8080

// 根據 README，Cloud Run 服務必須監聽 0.0.0.0
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log(`[server]: Production server is running at http://${host}:${port}`);
});