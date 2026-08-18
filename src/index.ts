import express, { Request, Response } from 'ultimate-express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from './config.js';
import { ingestTwseData } from './ingest.js';
import { ingestBwibbuAll } from './datasets/bwibbuAll.js';
import { ingestStockDayAvgAll } from './datasets/stockDayAvgAll.js';
import { ingestStockDayAll } from './datasets/stockDayAll.js';
import { connectDb } from './db.js';
import { timingSafeEqual } from 'crypto';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Swagger ---
// apis 用 __dirname 而非固定 'src'，這樣 dev（tsx 跑 src/*.ts）跟 build 後（node 跑 dist/*.js）都找得到同一批 JSDoc 註解。
// glob 用的路徑一定要是正斜線——Windows 上 path.join 出來的反斜線路徑，swagger-jsdoc 的 glob matcher 完全比對不到，spec 會是空的。
const toGlob = (...segments: string[]) => path.join(...segments).replace(/\\/g, '/');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TWSE 資料同步微服務 API',
      version: '1.0.0',
      description: '每日從台灣證券交易所抓取盤後資料，存入 Neon Postgres。',
    },
    components: {
      securitySchemes: {
        TaskSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Task-Secret',
        },
      },
    },
  },
  apis: [toGlob(__dirname, '*.ts'), toGlob(__dirname, '*.js')],
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
 * 本機開發用的 X-Task-Secret 驗證，失敗時已經回應 401。GCP 上改用 Cloud Run IAM，見 README「端點驗證」。
 * @returns {boolean} 是否通過驗證，false 時呼叫端應直接 return，不要再往下處理。
 */
function requireTaskSecret(req: Request, res: Response): boolean {
  if (!config.isProduction && config.taskSecret && !config.compareTaskSecret(req.headers['x-task-secret'] as string)) {
    res.status(401).json({ message: 'Unauthorized: Invalid X-Task-Secret' });
    return false;
  }
  return true;
}

/**
 * @swagger
 * /api/ingest/bwibbu-all:
 *   post:
 *     summary: 觸發 BWIBBU_ALL 抓取
 *     description: 對應 TWSE OpenAPI /exchangeReport/BWIBBU_ALL，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
 *     security:
 *       - TaskSecret: []
 *     responses:
 *       200:
 *         description: 抓取成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "BWIBBU_ALL" }
 *                 rows: { type: number, example: 1201 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
app.post('/api/ingest/bwibbu-all', async (req: Request, res: Response) => {
  if (!requireTaskSecret(req, res)) return;
  
  console.log('[ingest] Triggered for BWIBBU_ALL...');
  const result = await ingestBwibbuAll();
  console.log(`[ingest] Finished BWIBBU_ALL. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

/**
 * @swagger
 * /api/ingest/stock-day-all:
 *   post:
 *     summary: 觸發 STOCK_DAY_ALL 抓取與儲存
 *     description: 對應 TWSE OpenAPI /exchangeReport/STOCK_DAY_ALL，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
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
 *                 description: 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。實際仍取決於 TWSE OpenAPI 只回傳今天的資料。
 *                 example: "2026-08-15"
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "STOCK_DAY_ALL" }
 *                 rows: { type: number, example: 1373 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
app.post('/api/ingest/stock-day-all', async (req: Request, res: Response) => {
  if (!requireTaskSecret(req, res)) return;

  const date = req.body?.date;
  console.log(`[ingest] Triggered for STOCK_DAY_ALL for date: ${date || 'today'}...`);
  const result = await ingestStockDayAll(date);
  console.log(`[ingest] Finished STOCK_DAY_ALL. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
});

/**
 * @swagger
 * /api/ingest/stock-day-avg-all:
 *   post:
 *     summary: 觸發 STOCK_DAY_AVG_ALL 抓取與儲存
 *     description: 對應 TWSE OpenAPI /exchangeReport/STOCK_DAY_AVG_ALL，跟 /api/ingest 分開觸發，方便單獨驗證這個 dataset 的資料。
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
 *                 description: 指定要抓取的日期，格式為 YYYY-MM-DD。如果未提供，則抓取今天的資料（Asia/Taipei）。實際仍取決於 TWSE OpenAPI 只回傳今天的資料。
 *                 example: "2026-08-15"
 *     responses:
 *       200:
 *         description: 抓取與儲存成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dataset: { type: string, example: "STOCK_DAY_AVG_ALL" }
 *                 rows: { type: number, example: 1373 }
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未經授權的請求。
 */
app.post('/api/ingest/stock-day-avg-all', async (req: Request, res: Response) => {
  if (!requireTaskSecret(req, res)) return;

  const date = req.body?.date;
  console.log(`[ingest] Triggered for STOCK_DAY_AVG_ALL for date: ${date || 'today'}...`);
  const result = await ingestStockDayAvgAll(date);
  console.log(`[ingest] Finished STOCK_DAY_AVG_ALL. ok: ${result.ok}, rows: ${result.rows}`);
  res.status(result.ok ? 200 : 500).json(result);
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
  if (!requireTaskSecret(req, res)) return;

  const { date } = req.body ?? {};
  console.log(`[ingest] Triggered for all datasets for date: ${date || 'today'}...`);
  try {
    const result = await ingestTwseData(date);
    console.log(`[ingest] Finished all datasets for date: ${date || 'today'}.`);
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
      console.log(`[server]: API docs available at http://localhost:${port}/api-docs`);
    }
  });
};

startServer();