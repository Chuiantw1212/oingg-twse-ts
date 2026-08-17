import express, { Request, Response } from 'ultimate-express';
import { config } from './config';
import { ingestTwseData } from './ingest';
import { connectDb } from './db';
import { timingSafeEqual } from 'crypto';

const app = express();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes ---

/**
 * @swagger
 * /healthz:
 *   get:
 *     summary: 健康檢查
 *     description: 檢查服務是否正常運行，不連線資料庫。
 *     responses:
 *       200:
 *         description: 服務正常。
 */
app.get('/healthz', (req: Request, res: Response) => {
  res.status(200).send('OK');
});

/**
 * @swagger
 * /api/ingest:
 *   post:
 *     summary: 觸發 TWSE 資料抓取與儲存
 *     description: 接收外部排程器請求，抓取指定日期（或今天）的 TWSE 資料並儲存到 Neon DB。
 *     security:
 *       - TaskSecret: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料。
 *                 example: "2026-08-15"
 *     responses:
 *       200:
 *         description: 資料抓取與儲存任務已觸發。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tradeDate:
 *                   type: string
 *                   format: date
 *                   example: "2026-08-15"
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       dataset: { type: string, example: "BWIBBU_ALL" }
 *                       rows: { type: number, example: 1201 }
 *                       ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 *       500:
 *         description: 內部伺服器錯誤。
 */
app.post('/api/ingest', async (req: Request, res: Response) => {
  // Local development secret validation
  if (!config.isProduction && config.taskSecret && !config.compareTaskSecret(req.headers['x-task-secret'] as string)) {
    return res.status(401).json({ message: 'Unauthorized: Invalid X-Task-Secret' });
  }

  const { date } = req.body;
  try {
    const result = await ingestTwseData(date);
    res.status(200).json(result);
  } catch (error) {
    console.error('Ingestion failed:', error);
    res.status(500).json({ message: 'Failed to ingest data', error: (error as Error).message });
  }
});

// --- Root Path ---
app.get('/', (req: Request, res: Response) => {
  res.send('TWSE Data Sync Service is running.');
});

// --- Server Start ---
const startServer = async () => {
  await connectDb(); // Connect to DB on startup

  const host = config.isProduction ? '0.0.0.0' : 'localhost';
  const port = Number(config.port);

  app.listen(port, host, () => {
    console.log(`[server]: Server is running at http://${host}:${port}`);
    if (!config.isProduction) {
      console.log(`[server]: API docs available at http://localhost:${port}/api-docs (if Swagger is enabled)`);
    }
  });
};

startServer();