import express, { Express, Request, Response } from 'ultimate-express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import reportRouter from './api/routes/report.route';

const app: Express = express();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
// 遵循您在 README 中設計的結構
app.use('/api/reports', reportRouter);
// import taskRouter from './api/routes/task.route';
// app.use('/api/tasks', taskRouter);

// --- Swagger UI ---
// API 文件將在 /api-docs 路徑下提供
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Health Check ---
// 根據 README 建議，提供一個不需連線資料庫的健康檢查端點
app.get('/healthz', (req: Request, res: Response) => {
  res.status(200).send('OK');
});

// --- Root Path ---
// 根路徑提供一個簡單的歡迎訊息和文件連結
app.get('/', (req: Request, res: Response) => {
  res.send(
    'TWSE Data Sync Service is running. Visit /api-docs for documentation.'
  );
});

// 404 Handler for API routes
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    message: 'Not Found',
  });
});

export default app;