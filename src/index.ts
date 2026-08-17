import app from './app';
import dotenv from 'dotenv';

// 為了本地開發，從 .env 檔案載入環境變數
dotenv.config();

const port = process.env.PORT || 3000;

// 本地開發時監聽 localhost 即可
app.listen(port, 'localhost', () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
  console.log(
    `[server]: API docs available at http://localhost:${port}/api-docs`
  );
});